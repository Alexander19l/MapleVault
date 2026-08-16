import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { AsyncLocalStorage } from 'async_hooks';
import { shouldSeedDemoData } from './demoDataPolicy';

export const DB_PATH = process.env.DATABASE_PATH || path.join(path.resolve(__dirname, '../../../data'), 'database.sqlite');
const DB_DIR = path.dirname(DB_PATH);

// Asegurar que exista la carpeta de la base de datos
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function createDatabaseConnection(): sqlite3.Database {
  const connection = new sqlite3.Database(DB_PATH);
  connection.configure('busyTimeout', 10000);
  return connection;
}

let db = createDatabaseConnection();
let isDbClosed = false;
db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");
  db.run("PRAGMA foreign_keys = ON;");
});

const transactionScope = new AsyncLocalStorage<boolean>();
let operationQueue: Promise<void> = Promise.resolve();

function rawRun(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function rawGet(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function rawAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function rawClose(): Promise<void> {
  if (isDbClosed) return Promise.resolve();

  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) return reject(error);

      isDbClosed = true;
      resolve();
    });
  });
}

async function reopenDatabase(): Promise<void> {
  db = createDatabaseConnection();
  isDbClosed = false;
  await rawGet('PRAGMA journal_mode = WAL');
  await rawRun('PRAGMA synchronous = NORMAL');
  await rawRun('PRAGMA foreign_keys = ON');
}

function getIntegrityCheckResult(row: any): string {
  if (!row || typeof row !== 'object') return '';
  const [value] = Object.values(row);
  return String(value || '').toLowerCase();
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientFileLock(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EBUSY';
}

async function removeSqliteSidecarFile(filePath: string): Promise<void> {
  const retryDelays = [25, 50, 100, 200, 400];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      fs.rmSync(filePath, { force: true });
      return;
    } catch (error) {
      if (!isTransientFileLock(error) || attempt === retryDelays.length) {
        throw error;
      }
      await wait(retryDelays[attempt]);
    }
  }
}

function enqueueDbOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (transactionScope.getStore()) {
    return operation();
  }

  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

// Helper para envolver sqlite3 en promesas
export const query = {
  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return enqueueDbOperation(() => rawRun(sql, params));
  },
  get(sql: string, params: any[] = []): Promise<any> {
    return enqueueDbOperation(() => rawGet(sql, params));
  },
  all(sql: string, params: any[] = []): Promise<any[]> {
    return enqueueDbOperation(() => rawAll(sql, params));
  }
};

export function withTransaction<T>(operation: () => Promise<T>): Promise<T> {
  return enqueueDbOperation(() => transactionScope.run(true, async () => {
    await rawRun('BEGIN IMMEDIATE');
    try {
      const result = await operation();
      await rawRun('COMMIT');
      return result;
    } catch (error) {
      await rawRun('ROLLBACK');
      throw error;
    }
  }));
}

export function replaceDatabaseFromStaging(
  stagingPath: string,
  emergencyBackupPath?: string
): Promise<void> {
  const resolvedStagingPath = path.resolve(stagingPath);
  const resolvedDbDir = path.resolve(DB_DIR);
  const relativeStagingPath = path.relative(resolvedDbDir, resolvedStagingPath);

  if (relativeStagingPath.startsWith('..') || path.isAbsolute(relativeStagingPath)) {
    return Promise.reject(new Error('El archivo temporal de restauración está fuera del directorio permitido.'));
  }

  return enqueueDbOperation(async () => {
    const rollbackPath = path.join(
      DB_DIR,
      `${path.basename(DB_PATH)}.rollback-${process.pid}-${Date.now()}`
    );
    let swapStarted = false;
    let originalMoved = false;
    let replacementMoved = false;

    try {
      if (!fs.existsSync(resolvedStagingPath)) {
        throw new Error('El archivo temporal de restauración no existe.');
      }

      if (emergencyBackupPath && fs.existsSync(DB_PATH)) {
        const escapedEmergencyPath = emergencyBackupPath.replace(/'/g, "''");
        await rawRun(`VACUUM INTO '${escapedEmergencyPath}'`);
      }

      await rawGet('PRAGMA wal_checkpoint(TRUNCATE)');
      await rawClose();
      swapStarted = true;

      await removeSqliteSidecarFile(`${DB_PATH}-wal`);
      await removeSqliteSidecarFile(`${DB_PATH}-shm`);

      if (fs.existsSync(DB_PATH)) {
        fs.renameSync(DB_PATH, rollbackPath);
        originalMoved = true;
      }

      fs.renameSync(resolvedStagingPath, DB_PATH);
      replacementMoved = true;

      await reopenDatabase();
      const integrityRow = await rawGet('PRAGMA integrity_check');
      if (getIntegrityCheckResult(integrityRow) !== 'ok') {
        throw new Error('La base restaurada no superó la verificación de integridad.');
      }

      fs.rmSync(rollbackPath, { force: true });
    } catch (error) {
      if (!swapStarted) {
        throw error;
      }

      let rollbackError: unknown = null;
      try {
        await rawClose();

        if (replacementMoved) {
          fs.rmSync(DB_PATH, { force: true });
          await removeSqliteSidecarFile(`${DB_PATH}-wal`);
          await removeSqliteSidecarFile(`${DB_PATH}-shm`);
        }

        if (originalMoved && fs.existsSync(rollbackPath)) {
          fs.renameSync(rollbackPath, DB_PATH);
        }

        if (fs.existsSync(DB_PATH)) {
          await reopenDatabase();
        }
      } catch (restoreError) {
        rollbackError = restoreError;
      }

      if (rollbackError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        throw new Error(`${originalMessage} El rollback automático también falló: ${rollbackMessage}`);
      }

      throw error;
    } finally {
      fs.rmSync(resolvedStagingPath, { force: true });
    }
  });
}

export function closeDb(): Promise<void> {
  if (isDbClosed) return Promise.resolve();

  return enqueueDbOperation(() => rawClose());
}

export async function initDb() {
  console.log('Inicializando base de datos SQLite...');

  // Tabla: anime
  await query.run(`
    CREATE TABLE IF NOT EXISTS anime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id INTEGER,
      mal_id INTEGER,
      source TEXT,
      title TEXT NOT NULL,
      title_romaji TEXT,
      title_english TEXT,
      title_japanese TEXT,
      synopsis TEXT,
      year INTEGER,
      season TEXT,
      status TEXT,
      type TEXT,
      episodes INTEGER,
      duration INTEGER,
      score REAL,
      popularity INTEGER,
      cover_image TEXT,
      banner_image TEXT,
      studio TEXT,
      source_material TEXT,
      age_rating TEXT,
      start_date TEXT,
      end_date TEXT,
      official_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await query.run(`ALTER TABLE anime ADD COLUMN mal_id INTEGER`);
  } catch (err) {
    // La columna ya existe
  }

  // Agregar columna animeav1_slug si no existe
  try {
    await query.run(`ALTER TABLE anime ADD COLUMN animeav1_slug TEXT`);
  } catch (err) {
    // La columna ya existe
  }

  // Agregar columna tioanime_slug si no existe
  try {
    await query.run(`ALTER TABLE anime ADD COLUMN tioanime_slug TEXT`);
  } catch (err) {
    // La columna ya existe
  }

  // Agregar columna jkanime_slug si no existe
  try {
    await query.run(`ALTER TABLE anime ADD COLUMN jkanime_slug TEXT`);
  } catch (err) {
    // La columna ya existe
  }

  // Agregar columna animeflv_slug si no existe
  try {
    await query.run(`ALTER TABLE anime ADD COLUMN animeflv_slug TEXT`);
  } catch (err) {
    // La columna ya existe
  }

  // Agregar columna is_adult si no existe
  try {
    await query.run(`ALTER TABLE anime ADD COLUMN is_adult INTEGER DEFAULT 0`);
  } catch (err) {
    // La columna ya existe
  }

  // Asociaciones regenerables para fuentes de episodios externas.
  // Evita ampliar la tabla anime con una columna por cada proveedor nuevo.
  await query.run(`
    CREATE TABLE IF NOT EXISTS anime_episode_sources (
      anime_id INTEGER NOT NULL,
      provider_id TEXT NOT NULL,
      external_key TEXT NOT NULL,
      source_title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (anime_id, provider_id),
      FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
    )
  `);

  // Tabla: genres
  await query.run(`
    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // Tabla: anime_genres
  await query.run(`
    CREATE TABLE IF NOT EXISTS anime_genres (
      anime_id INTEGER,
      genre_id INTEGER,
      PRIMARY KEY (anime_id, genre_id),
      FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
      FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
    )
  `);

  // Tabla: user_list
  await query.run(`
    CREATE TABLE IF NOT EXISTS user_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER UNIQUE,
      watch_status TEXT NOT NULL, -- 'watching', 'plan_to_watch', 'completed', 'dropped', 'on_hold'
      favorite INTEGER DEFAULT 0, -- 0 o 1
      user_score INTEGER DEFAULT 0,
      episodes_watched INTEGER DEFAULT 0,
      notes TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
    )
  `);

  // Tabla: sources
  await query.run(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      base_url TEXT,
      type TEXT, -- 'api' o 'scraping'
      enabled INTEGER DEFAULT 1,
      rate_limit INTEGER DEFAULT 1000, -- ms entre solicitudes
      last_sync TEXT
    )
  `);

  // Tabla: scraping_logs
  await query.run(`
    CREATE TABLE IF NOT EXISTS scraping_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      action TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla: chat_messages
  await query.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL, -- 'user' o 'assistant'
      content TEXT NOT NULL,
      visual_data TEXT,
      action TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
    
  // Migraciones seguras para columnas nuevas en chat_messages (si la tabla ya existía)
  try {
    await query.run(`ALTER TABLE chat_messages ADD COLUMN visual_data TEXT;`);
  } catch (e) { /* Columna ya existe */ }
  try {
    await query.run(`ALTER TABLE chat_messages ADD COLUMN action TEXT;`);
  } catch (e) { /* Columna ya existe */ }

  // Tabla: bot_memory (Preferencias a largo plazo del asistente NLP)
  await query.run(`
    CREATE TABLE IF NOT EXISTS bot_memory (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla: ai_settings (Configuraciones de LLMs locales como Ollama)
  await query.run(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla: assistant_prompt_runs (Logging de ejecuciones NLP)
  await query.run(`
    CREATE TABLE IF NOT EXISTS assistant_prompt_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_prompt TEXT,
      model_response_raw TEXT,
      model_response_parsed TEXT,
      detected_intent TEXT,
      nlp_engine TEXT DEFAULT 'regex',
      selected_tool TEXT,
      tool_params TEXT,
      requires_confirmation INTEGER,
      execution_status TEXT,
      execution_result TEXT,
      latency_ms INTEGER,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await query.run(`ALTER TABLE assistant_prompt_runs ADD COLUMN nlp_engine TEXT DEFAULT 'regex';`);
  } catch (e) { /* Columna ya existe */ }

  // Tabla: assistant_memory (Memoria avanzada del asistente)
  await query.run(`
    CREATE TABLE IF NOT EXISTS assistant_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      category TEXT,
      source TEXT,
      confidence INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla: watched_episodes
  await query.run(`
    CREATE TABLE IF NOT EXISTS watched_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER,
      episode_number INTEGER,
      watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(anime_id, episode_number),
      FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
    )
  `);

  // Tabla: anime_relations (Precuelas, secuelas y películas)
  await query.run(`
    CREATE TABLE IF NOT EXISTS anime_relations (
      anime_id INTEGER,
      related_external_id INTEGER,
      relation_type TEXT,
      title TEXT,
      format TEXT,
      type TEXT,
      status TEXT,
      cover_image TEXT,
      PRIMARY KEY (anime_id, related_external_id),
      FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
    )
  `);

  // Tabla: anime_translations (textos derivados para no sobrescribir metadatos originales)
  await query.run(`
    CREATE TABLE IF NOT EXISTS anime_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER,
      entity_key TEXT NOT NULL,
      field TEXT NOT NULL,
      source_language TEXT DEFAULT 'auto',
      target_language TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT DEFAULT 'translated',
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_key, field, target_language, source_hash),
      FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE
    )
  `);

  // Tablas de manga: preparadas para lectura/lista futura, sin fuentes activas por defecto.
  await query.run(`
    CREATE TABLE IF NOT EXISTS manga (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id INTEGER,
      mal_id INTEGER,
      source TEXT,
      title TEXT NOT NULL,
      title_romaji TEXT,
      title_english TEXT,
      title_japanese TEXT,
      synopsis TEXT,
      year INTEGER,
      status TEXT,
      format TEXT,
      chapters INTEGER,
      volumes INTEGER,
      score REAL,
      popularity INTEGER,
      cover_image TEXT,
      banner_image TEXT,
      author TEXT,
      artist TEXT,
      start_date TEXT,
      end_date TEXT,
      official_url TEXT,
      is_adult INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS manga_genres (
      manga_id INTEGER,
      genre_id INTEGER,
      PRIMARY KEY (manga_id, genre_id),
      FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
      FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS manga_user_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id INTEGER UNIQUE,
      read_status TEXT NOT NULL,
      favorite INTEGER DEFAULT 0,
      user_score REAL DEFAULT 0,
      chapters_read INTEGER DEFAULT 0,
      volumes_read INTEGER DEFAULT 0,
      notes TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS manga_chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id INTEGER,
      source TEXT NOT NULL,
      source_chapter_id TEXT,
      chapter_number REAL,
      title TEXT,
      url TEXT,
      language TEXT DEFAULT 'es',
      scanlator TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(manga_id, source, source_chapter_id, language),
      FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS manga_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      base_url TEXT,
      language TEXT DEFAULT 'multi',
      type TEXT DEFAULT 'metadata',
      enabled INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'medium',
      rate_limit INTEGER DEFAULT 3000,
      last_sync TEXT
    )
  `);

  const defaultMangaSources = [
    { name: 'AniList Manga', url: 'https://graphql.anilist.co', language: 'multi', type: 'metadata', risk: 'low', limit: 1000 },
    { name: 'MangaDex API', url: 'https://api.mangadex.org', language: 'es/en', type: 'api', risk: 'medium', limit: 2000 },
    { name: 'ZonaTMO', url: 'https://zonatmo.org', language: 'es', type: 'web', risk: 'high', limit: 60 },
    { name: 'ShadeManga', url: 'https://shademanga.com/api', language: 'es', type: 'api', risk: 'medium', limit: 600 }
  ];

  await query.run(`
    DELETE FROM manga_sources
    WHERE name IN ('ManhwaWeb', 'NovelCool ES')
  `);

  for (const src of defaultMangaSources) {
    await query.run(`
      INSERT OR IGNORE INTO manga_sources (name, base_url, language, type, enabled, risk_level, rate_limit)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `, [src.name, src.url, src.language, src.type, src.risk, src.limit]);
  }

  const performanceIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_anime_title_nocase ON anime(title COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_title_romaji_nocase ON anime(title_romaji COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_title_english_nocase ON anime(title_english COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_status ON anime(status)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_type ON anime(type)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_year ON anime(year)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_season ON anime(season)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_year_season_popularity ON anime(year, season, popularity DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_score ON anime(score)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_popularity ON anime(popularity)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_status_popularity ON anime(status, popularity DESC, score DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_is_adult ON anime(is_adult)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_source_external ON anime(source, external_id)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_mal_id ON anime(mal_id)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_episode_sources_provider ON anime_episode_sources(provider_id, anime_id)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_title_nocase ON manga(title COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_title_romaji_nocase ON manga(title_romaji COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_source_external ON manga(source, external_id)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_mal_id ON manga(mal_id)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_status ON manga(status)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_format ON manga(format)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_year ON manga(year)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_popularity ON manga(popularity)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_user_list_status ON manga_user_list(read_status)`,
    `CREATE INDEX IF NOT EXISTS idx_manga_chapters_manga ON manga_chapters(manga_id)`,
    `CREATE INDEX IF NOT EXISTS idx_genres_name_nocase ON genres(name COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_anime_genres_genre_anime ON anime_genres(genre_id, anime_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_list_watch_status ON user_list(watch_status)`,
    `CREATE INDEX IF NOT EXISTS idx_user_list_favorite ON user_list(favorite)`,
    `CREATE INDEX IF NOT EXISTS idx_user_list_updated_at ON user_list(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_watched_episodes_anime ON watched_episodes(anime_id)`
  ];

  for (const indexSql of performanceIndexes) {
    await query.run(indexSql);
  }

  // Insertar fuentes por defecto si no existen
  const defaultSources = [
    { name: 'AniList API', url: 'https://graphql.anilist.co', type: 'api', limit: 1000 },
    { name: 'Jikan API (MyAnimeList)', url: 'https://api.jikan.moe/v4', type: 'api', limit: 2000 },
    { name: 'Kitsu API', url: 'https://kitsu.io/api/edge', type: 'api', limit: 1000 },
    { name: 'AnimeV1 Scraping', url: 'https://animev1.com', type: 'scraping', limit: 3000 }
  ];

  for (const src of defaultSources) {
    await query.run(`
      INSERT OR IGNORE INTO sources (name, base_url, type, enabled, rate_limit)
      VALUES (?, ?, ?, ?, ?)
    `, [src.name, src.url, src.type, 1, src.limit]);
  }

  // Los datos de demostración son opt-in y nunca se insertan en una instalación normal.
  const count = await query.get('SELECT COUNT(*) as count FROM anime');
  if (count && count.count === 0 && shouldSeedDemoData()) {
    console.log('Sembrando base de datos con animes populares de muestra...');
    await seedAnimeData();
  }

  // Ejecutar deduplicación en el arranque
  if (process.env.MAPLEVAULT_DEDUP_ON_STARTUP === 'true') {
    try {
      await deduplicateDatabase();
    } catch (err) {
      console.error('Error al deduplicar la base de datos en el arranque:', err);
    }
  }
}

async function deduplicateDatabase() {
  console.log('[Deduplicación] Iniciando escaneo de base de datos...');
  const duplicateGroups = await query.all(`
    SELECT LOWER(title) as lower_title, COALESCE(year, 0) as year_val, COUNT(*) as cnt
    FROM anime
    GROUP BY lower_title, year_val
    HAVING COUNT(*) > 1
  `);

  if (duplicateGroups.length === 0) {
    console.log('[Deduplicación] No se encontraron registros duplicados.');
    return;
  }

  console.log(`[Deduplicación] Encontrados ${duplicateGroups.length} grupos duplicados. Resolviendo...`);

  for (const group of duplicateGroups) {
    const title = group.lower_title;
    const year = group.year_val === 0 ? null : group.year_val;

    let rows;
    if (year === null) {
      rows = await query.all(
        'SELECT id, title, year, animeav1_slug, tioanime_slug FROM anime WHERE LOWER(title) = ? AND year IS NULL',
        [title]
      );
    } else {
      rows = await query.all(
        'SELECT id, title, year, animeav1_slug, tioanime_slug FROM anime WHERE LOWER(title) = ? AND year = ?',
        [title, year]
      );
    }

    if (rows.length <= 1) continue;

    console.log(`[Deduplicación] Procesando "${rows[0].title}" (${year || 'Año desconocido'}) - ${rows.length} duplicados`);

    const candidates = [];
    for (const row of rows) {
      const userListRecord = await query.get('SELECT id, watch_status, favorite, user_score, episodes_watched FROM user_list WHERE anime_id = ?', [row.id]);
      const watched = await query.get('SELECT COUNT(*) as cnt FROM watched_episodes WHERE anime_id = ?', [row.id]);

      let score = 0;
      if (userListRecord) {
        score += 1000;
        if (userListRecord.watch_status === 'completed') score += 100;
        if (userListRecord.watch_status === 'watching') score += 50;
      }
      score += (watched ? watched.cnt : 0) * 10;
      if (row.animeav1_slug) score += 2;
      if (row.tioanime_slug) score += 2;

      candidates.push({ id: row.id, score });
    }

    // Ordenar por puntuación descendente
    candidates.sort((a, b) => b.score - a.score);
    const mainId = candidates[0].id;
    const duplicateIds = candidates.slice(1).map(c => c.id);

    console.log(`[Deduplicación] Manteniendo ID principal ${mainId}. Fusionando duplicados: ${duplicateIds.join(', ')}`);

    for (const dupId of duplicateIds) {
      // 1. Fusionar user_list
      const mainUserList = await query.get('SELECT id FROM user_list WHERE anime_id = ?', [mainId]);
      const dupUserList = await query.get('SELECT id, watch_status, favorite, user_score, episodes_watched, notes, started_at, completed_at FROM user_list WHERE anime_id = ?', [dupId]);

      if (dupUserList) {
        if (!mainUserList) {
          // Mover registro al principal
          await query.run('UPDATE user_list SET anime_id = ? WHERE id = ?', [mainId, dupUserList.id]);
        } else {
          // Si ambos tienen, preferimos el que tenga más progreso o notas, y eliminamos el otro
          await query.run('DELETE FROM user_list WHERE id = ?', [dupUserList.id]);
        }
      }

      // 2. Fusionar watched_episodes
      try {
        await query.run('UPDATE OR IGNORE watched_episodes SET anime_id = ? WHERE anime_id = ?', [mainId, dupId]);
      } catch (_) {}
      await query.run('DELETE FROM watched_episodes WHERE anime_id = ?', [dupId]);

      // 3. Fusionar anime_genres
      try {
        await query.run('UPDATE OR IGNORE anime_genres SET anime_id = ? WHERE anime_id = ?', [mainId, dupId]);
      } catch (_) {}
      await query.run('DELETE FROM anime_genres WHERE anime_id = ?', [dupId]);

      // 4. Eliminar anime duplicado
      await query.run('DELETE FROM anime WHERE id = ?', [dupId]);
    }
  }

  console.log('[Deduplicación] Finalizada con éxito.');
}

async function seedAnimeData() {
  const seedAnimes = [
    {
      title: 'Frieren: Beyond Journey\'s End',
      title_romaji: 'Sousou no Frieren',
      title_english: 'Frieren: Beyond Journey\'s End',
      title_japanese: '葬送のフリーレン',
      synopsis: 'Durante una aventura de una década junto al héroe Himmel y su grupo, la maga elfa Frieren y sus compañeros derrotan al Rey Demonio, trayendo la paz al reino. Tras la victoria, el grupo se separa y Frieren promete reencontrarse con ellos en cincuenta años. Sin embargo, el tiempo transcurre de forma muy distinta para una elfa inmortal, y tras la muerte de Himmel, Frieren lamenta no haberlo conocido mejor. Así comienza un nuevo viaje para comprender a los humanos.',
      year: 2023,
      season: 'fall',
      status: 'finished',
      type: 'tv',
      episodes: 28,
      duration: 24,
      score: 9.38,
      popularity: 180000,
      cover_image: 'https://media.kitsu.io/anime/46422/poster/large-41ffde166e40d04c449339e1451f2f3f.jpeg',
      banner_image: 'https://media.kitsu.io/anime/46422/cover/large-7164ff582312b180907eb64d262b9264.jpeg',
      studio: 'Madhouse',
      source_material: 'manga',
      age_rating: 'PG-13',
      start_date: '2023-09-29',
      end_date: '2024-03-22',
      official_url: 'https://frieren-anime.jp/',
      genres: ['Fantasy', 'Adventure', 'Drama']
    },
    {
      title: 'Attack on Titan',
      title_romaji: 'Shingeki no Kyojin',
      title_english: 'Attack on Titan',
      title_japanese: '進撃の巨人',
      synopsis: 'Hace cien años, la humanidad se vio al borde de la extinción tras la aparición de gigantescos monstruos devoradores de hombres conocidos como Titanes. Para protegerse, los supervivientes construyeron tres murallas concéntricas de 50 metros de altura. Tras un siglo de paz, un Titán Colosal destruye el muro exterior, obligando al joven Eren Yeager y a sus amigos a unirse al cuerpo de exploración para combatir la amenaza y vengar a su madre.',
      year: 2013,
      season: 'spring',
      status: 'finished',
      type: 'tv',
      episodes: 25,
      duration: 24,
      score: 8.54,
      popularity: 350000,
      cover_image: 'https://media.kitsu.io/anime/7442/poster/large-a2b16df8d06bcf1297c8d9dfd70659fb.jpeg',
      banner_image: 'https://media.kitsu.io/anime/7442/cover/large-eb857c3905cf65c92c90069a53fe1e36.jpeg',
      studio: 'Wit Studio',
      source_material: 'manga',
      age_rating: 'R - 17+',
      start_date: '2013-04-07',
      end_date: '2013-09-29',
      official_url: 'https://shingeki.tv/',
      genres: ['Action', 'Drama', 'Fantasy', 'Mystery']
    },
    {
      title: 'Jujutsu Kaisen',
      title_romaji: 'Jujutsu Kaisen',
      title_english: 'Jujutsu Kaisen',
      title_japanese: '呪術廻戦',
      synopsis: 'Yuji Itadori es un estudiante de secundaria con una fuerza física excepcional que prefiere pasar el tiempo en el club de ocultismo. La vida de Yuji cambia drásticamente cuando sus compañeros abren un objeto maldito y atraen poderosas maldiciones. Para salvarlos, Yuji se traga el dedo del legendario demonio Ryomen Sukuna, convirtiéndose en su recipiente y entrando en la academia de hechicería jujutsu.',
      year: 2020,
      season: 'fall',
      status: 'finished',
      type: 'tv',
      episodes: 24,
      duration: 24,
      score: 8.67,
      popularity: 280000,
      cover_image: 'https://media.kitsu.io/anime/42765/poster/large-7a3c3e5361099ec1c7fa15f8fb9547aa.jpeg',
      banner_image: 'https://media.kitsu.io/anime/42765/cover/large-05b630e527d7f763f0d48f7d983e20e8.jpeg',
      studio: 'MAPPA',
      source_material: 'manga',
      age_rating: 'R - 17+',
      start_date: '2020-10-03',
      end_date: '2021-03-27',
      official_url: 'https://jujutsukaisen.jp/',
      genres: ['Action', 'Fantasy']
    },
    {
      title: 'Chainsaw Man',
      title_romaji: 'Chainsaw Man',
      title_english: 'Chainsaw Man',
      title_japanese: 'チェンソーマン',
      synopsis: 'Denji es un joven atrapado en la pobreza extrema que caza demonios para pagar la enorme deuda de su fallecido padre a la yakuza, asistido por su fiel mascota demonio Pochita. Traicionado y asesinado por sus empleadores, Denji se fusiona con Pochita para resucitar como un híbrido humano-demonio con motosierras en sus extremidades, siendo reclutado por Makima de Seguridad Pública.',
      year: 2022,
      season: 'fall',
      status: 'finished',
      type: 'tv',
      episodes: 12,
      duration: 24,
      score: 8.52,
      popularity: 210000,
      cover_image: 'https://media.kitsu.io/anime/44081/poster/large-86e082f5c71b0583b4c2b9f3fe708170.jpeg',
      banner_image: 'https://media.kitsu.io/anime/44081/cover/large-e74c8a2b534e808ce315e98583fb9bf9.jpeg',
      studio: 'MAPPA',
      source_material: 'manga',
      age_rating: 'R - 17+',
      start_date: '2022-10-12',
      end_date: '2022-12-28',
      official_url: 'https://chainsawman.dog/',
      genres: ['Action', 'Fantasy', 'Comedy']
    },
    {
      title: 'Demon Slayer: Kimetsu no Yaiba',
      title_romaji: 'Kimetsu no Yaiba',
      title_english: 'Demon Slayer: Kimetsu no Yaiba',
      title_japanese: '鬼滅の刃',
      synopsis: 'Tanjiro Kamado es un joven bondadoso que se gana la vida vendiendo carbón para mantener a su familia. Su vida pacífica es destruida cuando un demonio asesina a toda su familia, con la única excepción de su hermana menor Nezuko, quien ha sido transformada ella misma en un demonio. Tanjiro decide convertirse en un cazador de demonios para vengar a su familia y curar a Nezuko.',
      year: 2019,
      season: 'spring',
      status: 'finished',
      type: 'tv',
      episodes: 26,
      duration: 24,
      score: 8.49,
      popularity: 320000,
      cover_image: 'https://media.kitsu.io/anime/41370/poster/large-cda72a15c3272d5efdf0d720760435df.jpeg',
      banner_image: 'https://media.kitsu.io/anime/41370/cover/large-8efc32ffc926f254ab24d0840b2e8800.jpeg',
      studio: 'ufotable',
      source_material: 'manga',
      age_rating: 'R - 17+',
      start_date: '2019-04-06',
      end_date: '2019-09-28',
      official_url: 'https://kimetsu.com/',
      genres: ['Action', 'Fantasy']
    },
    {
      title: 'Solo Leveling',
      title_romaji: 'Ore dake Level Up na Ken',
      title_english: 'Solo Leveling',
      title_japanese: '俺だけレベルアップな件',
      synopsis: 'En un mundo donde portales llamados mazmorras conectan la Tierra con dimensiones plagadas de monstruos, ciertos humanos han despertado habilidades especiales para cazarlos. Jinwoo Sung es un cazador de rango E conocido como \"el más débil de la humanidad\". Tras quedar atrapado en una mazmorra doble de pesadilla, Jinwoo sobrevive milagrosamente y obtiene el acceso a un misterioso sistema que le permite subir de nivel ilimitadamente.',
      year: 2024,
      season: 'winter',
      status: 'finished',
      type: 'tv',
      episodes: 12,
      duration: 24,
      score: 8.36,
      popularity: 150000,
      cover_image: 'https://media.kitsu.io/anime/46174/poster/large-7a32cb8749a21ce100a0be3b9eb22c71.jpeg',
      banner_image: 'https://media.kitsu.io/anime/46174/cover/large-37f078a99478f77341e97de6d62a9394.jpeg',
      studio: 'A-1 Pictures',
      source_material: 'web_novel',
      age_rating: 'R - 17+',
      start_date: '2024-01-07',
      end_date: '2024-03-30',
      official_url: 'https://sololeveling-anime.net/',
      genres: ['Action', 'Fantasy', 'Adventure']
    }
  ];

  for (const anime of seedAnimes) {
    const res = await query.run(`
      INSERT INTO anime (
        title, title_romaji, title_english, title_japanese, synopsis,
        year, season, status, type, episodes, duration, score, popularity,
        cover_image, banner_image, studio, source_material, age_rating,
        start_date, end_date, official_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      anime.title, anime.title_romaji, anime.title_english, anime.title_japanese, anime.synopsis,
      anime.year, anime.season, anime.status, anime.type, anime.episodes, anime.duration, anime.score, anime.popularity,
      anime.cover_image, anime.banner_image, anime.studio, anime.source_material, anime.age_rating,
      anime.start_date, anime.end_date, anime.official_url
    ]);

    const animeId = res.lastID;

    // Relacionar géneros
    for (const genreName of anime.genres) {
      // Intentar insertar género
      await query.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
      const genreRow = await query.get('SELECT id FROM genres WHERE name = ?', [genreName]);
      if (genreRow) {
        await query.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [animeId, genreRow.id]);
      }
    }

    // Para que el catálogo tenga algo de actividad de usuario, agregaremos 2 animes a la lista del usuario
    if (anime.title === 'Frieren: Beyond Journey\'s End') {
      await query.run(`
        INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, notes)
        VALUES (?, 'completed', 1, 10, 28, 'Una absoluta obra maestra de la fantasía y el slice of life. Hermosa animación.')
      `, [animeId]);
    } else if (anime.title === 'Solo Leveling') {
      await query.run(`
        INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, notes)
        VALUES (?, 'watching', 0, 8, 5, 'Muy buenas escenas de acción.')
      `, [animeId]);
    }
  }
  console.log('Sembrado completado con éxito.');
}
