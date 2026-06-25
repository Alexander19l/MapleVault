import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { initDb, query, DB_PATH } from './database/db';
import { searchAniList, getAniListAnimeById, syncSeasonFromAniList, saveNormalizedAnimeToLocal, getAnimeAV1Slug, getAnimeAV1Episodes, getAnimeAV1Embeds, getTioAnimeSlug, getTioAnimeEpisodes, getTioAnimeServers, getAnimeFLVSlug, getAnimeFLVEpisodes, getAnimeFLVServers, getJKAnimeSlug, getJKAnimeEpisodes, getJKAnimeServers, logScraping } from './scraping/scraper';
import { getLocalRecommendations } from './recommendations/recommender';
import { handleChatMessage, executeChatbotAction, isAllowedChatbotAction } from './chatbot/chatbot';
import { getMapleAssistantCapabilities } from './chatbot/capabilities';
import { createRateLimitMiddleware } from './security/rateLimiter';
import { createSessionAuthMiddleware } from './security/sessionAuth';
import { validateAnimeInput, validateUserListInput, validateSearchFilters, validateId, validateLocalServiceUrl, validatePayloadSize } from './security/validators';
import { sanitizeChatInput, sanitizeExternalAnime } from './security/sanitize';
import { createBackup, listBackups, restoreBackup, deleteBackup } from './database/backup';
import { getAISettings, setAISettings, resetAISettings } from './chatbot/aiSettings';
import { buildUserSoulProfile, clearAllMemory, getUserSoulData, seedInitialMemory } from './chatbot/memory';
import { decorateAnimeListWithSpanishTranslation, decorateAnimeWithSpanishTranslation } from './translation/translationService';
import { ensureLibreTranslateRunning, getLibreTranslateRuntimeStatus, stopLibreTranslateRuntime } from './translation/translationRuntime';
import { enforceSupportedAppearance } from './settings/settingsPolicy';
import axios from 'axios';

const app = express();
const parsedPort = Number.parseInt(process.env.PORT || '5000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 5000;
const HOST = process.env.MAPLEVAULT_HOST || '127.0.0.1';

// Configuracin de CORS restrictiva para seguridad local (prevenir CSRF)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('file://') || origin.startsWith('vscode-webview://')) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por la poltica de seguridad CORS de MapleVault (Origen no permitido)'));
    }
  }
}));

// Límite de tamaño de payload: 2MB máximo (previene payloads maliciosos)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Cabeceras de seguridad
app.use((_req: any, res: any, next: any) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  next();
});

// En producción Electron configura un token aleatorio por sesión.
app.use(createSessionAuthMiddleware());

// Rate limiting general
app.use(createRateLimitMiddleware('general'));

const DATA_DIR = path.dirname(DB_PATH);
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DASHBOARD_SUMMARY_CACHE_KEY = 'dashboard:summary';
const SEASON_SUMMARY_CACHE_KEY = 'seasons:summary';
const RECOMMENDATIONS_CACHE_KEY = 'recommendations:local';
const SUMMARY_CACHE_TTL_MS = Number(process.env.MAPLEVAULT_SUMMARY_CACHE_TTL_MS || 30_000);

const responseCache = new Map<string, { expiresAt: number; value: any }>();

// Asegurar directorios
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

function getCachedResponse<T>(key: string): T | null {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return cached.value as T;
}

function setCachedResponse(key: string, value: any, ttlMs = SUMMARY_CACHE_TTL_MS) {
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function invalidateLibraryReadCaches() {
  responseCache.delete(DASHBOARD_SUMMARY_CACHE_KEY);
  responseCache.delete(SEASON_SUMMARY_CACHE_KEY);
  responseCache.delete(RECOMMENDATIONS_CACHE_KEY);
}

function defaultAppSettings() {
  return {
    theme: 'dark',
    language: 'es',
    closeBehavior: 'ask',
    translation: {
      enabled: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
      autoStart: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
      provider: 'libretranslate',
      url: process.env.LIBRETRANSLATE_URL || 'http://localhost:5001',
      apiKey: process.env.LIBRETRANSLATE_API_KEY || '',
      timeoutMs: Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || 5000),
      cacheEnabled: true,
      translateSynopsis: true,
      translateGenres: true,
      translateStatuses: true
    }
  };
}

function normalizeTranslationSettingsForStorage(raw: any, fallback: any) {
  const candidateUrl = String(raw?.url || fallback?.url || 'http://localhost:5001').trim();
  const validatedUrl = validateLocalServiceUrl(candidateUrl);
  const fallbackUrl = validateLocalServiceUrl(fallback?.url || 'http://localhost:5001');
  const url = validatedUrl.valid ? validatedUrl.url : fallbackUrl.url || 'http://localhost:5001';

  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback?.enabled ?? true,
    autoStart: typeof raw?.autoStart === 'boolean' ? raw.autoStart : fallback?.autoStart ?? true,
    provider: 'libretranslate',
    url,
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey.slice(0, 500) : fallback?.apiKey || '',
    timeoutMs: Number.isFinite(Number(raw?.timeoutMs))
      ? Math.min(Math.max(Number(raw.timeoutMs), 3000), 15000)
      : fallback?.timeoutMs || 5000,
    cacheEnabled: typeof raw?.cacheEnabled === 'boolean' ? raw.cacheEnabled : fallback?.cacheEnabled ?? true,
    translateSynopsis: typeof raw?.translateSynopsis === 'boolean' ? raw.translateSynopsis : fallback?.translateSynopsis ?? true,
    translateGenres: typeof raw?.translateGenres === 'boolean' ? raw.translateGenres : fallback?.translateGenres ?? true,
    translateStatuses: typeof raw?.translateStatuses === 'boolean' ? raw.translateStatuses : fallback?.translateStatuses ?? true
  };
}

// Cargar o crear configuracin por defecto
function loadSettings() {
  const defaults = defaultAppSettings();
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
  try {
    const stored = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const normalized = enforceSupportedAppearance({
      ...defaults,
      ...stored,
      translation: normalizeTranslationSettingsForStorage(stored.translation, defaults.translation)
    });
    if (stored.theme !== 'dark' || stored.language !== 'es') {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(normalized, null, 2), 'utf8');
    }
    return normalized;
  } catch (err) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
}

function validateBodySize(res: express.Response, body: unknown): boolean {
  if (!validatePayloadSize(body)) {
    res.status(413).json({ error: 'Payload demasiado grande.' });
    return false;
  }
  return true;
}

function getValidatedId(rawId: unknown, res: express.Response): number | null {
  const id = validateId(rawId);
  if (!id) {
    res.status(400).json({ error: 'ID inválido.' });
    return null;
  }
  return id;
}

function validateAnimePayload(raw: any, requireTitle = true): { valid: boolean; errors: string[]; data: any } {
  const externalSafe = sanitizeExternalAnime(raw || {});
  const validation = validateAnimeInput(externalSafe);
  const errors = [...validation.errors];

  if (requireTitle && !externalSafe.title) {
    errors.push('El título es requerido.');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { ...externalSafe, ...validation.sanitized }
  };
}

function attachJoinedGenres(rows: any[]): any[] {
  return rows.map(row => {
    const genres = String(row.genres_joined || '')
      .split(',')
      .map(genre => genre.trim())
      .filter(Boolean);
    const { genres_joined: _genresJoined, ...rest } = row;
    return { ...rest, genres };
  });
}

function buildAnimeFilterClause(filters: Record<string, any>, adult: 'only' | 'include' | undefined) {
  const { q, year, season, genre, status, type, score } = filters;
  const params: any[] = [];
  let whereSql = ' WHERE 1=1 ';

  if (adult === 'only') {
    whereSql += ` AND (a.is_adult = 1 OR a.id IN (SELECT anime_id FROM anime_genres ag2 JOIN genres g2 ON ag2.genre_id = g2.id WHERE g2.name = 'Hentai') OR a.age_rating LIKE '%Rx%' OR a.age_rating LIKE '%Hentai%') `;
  } else if (q && String(q).trim() !== '') {
    // Las búsquedas explícitas pueden mostrar coincidencias adultas si el usuario las pide.
  } else {
    whereSql += ` AND a.is_adult = 0 AND a.id NOT IN (SELECT anime_id FROM anime_genres ag2 JOIN genres g2 ON ag2.genre_id = g2.id WHERE g2.name = 'Hentai') AND (a.age_rating IS NULL OR (a.age_rating NOT LIKE '%Rx%' AND a.age_rating NOT LIKE '%Hentai%')) `;
  }

  if (q) {
    whereSql += ` AND (a.title LIKE ? OR a.title_romaji LIKE ? OR a.title_english LIKE ?) `;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (year) {
    whereSql += ` AND a.year = ? `;
    params.push(parseInt(year as string, 10));
  }
  if (season) {
    whereSql += ` AND a.season = ? `;
    params.push(String(season).toLowerCase());
  }
  if (genre) {
    whereSql += `
      AND EXISTS (
        SELECT 1
        FROM anime_genres agf
        JOIN genres gf ON agf.genre_id = gf.id
        WHERE agf.anime_id = a.id
          AND gf.name = ?
      )
    `;
    params.push(genre as string);
  }
  if (status) {
    whereSql += ` AND a.status = ? `;
    params.push(status as string);
  }
  if (type) {
    whereSql += ` AND a.type = ? `;
    params.push(type as string);
  }
  if (score) {
    whereSql += ` AND a.score >= ? `;
    params.push(parseFloat(score as string));
  }

  return { whereSql, params };
}

function buildAnimeOrderClause(sort: string | undefined): string {
  if (sort === 'title') return ' ORDER BY a.title ASC ';
  if (sort === 'year_desc') return ' ORDER BY a.year DESC, a.start_date DESC ';
  if (sort === 'year_asc') return ' ORDER BY a.year ASC, a.start_date ASC ';
  if (sort === 'score') return ' ORDER BY a.score DESC ';
  if (sort === 'popularity') return ' ORDER BY a.popularity DESC ';
  return ' ORDER BY a.id DESC ';
}

// ==========================================
// 1. ENDPOINTS DE ANIME (CRUD + BSQUEDA)
// ==========================================

// GET /anime - Listar con filtros avanzados
app.get('/anime', async (req, res) => {
  try {
    const filters = validateSearchFilters(req.query as Record<string, any>);
    const { sort, limit, offset, withTotal, translateSynopsis, includeSynopsis } = filters;
    const adult = req.query.adult === 'only' ? 'only' : req.query.adult === 'include' ? 'include' : undefined;
    const { whereSql, params } = buildAnimeFilterClause(filters, adult);
    const animeSelect = includeSynopsis || translateSynopsis
      ? 'a.*'
      : `
        a.id, a.external_id, a.source, a.title, a.title_romaji, a.title_english, a.title_japanese,
        a.year, a.season, a.status, a.type, a.episodes, a.duration, a.score, a.popularity,
        a.cover_image, a.banner_image, a.studio, a.source_material, a.age_rating,
        a.start_date, a.end_date, a.created_at, a.updated_at, a.is_adult
      `;
    
    let sql = `
      SELECT ${animeSelect}, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched, ul.notes,
             GROUP_CONCAT(DISTINCT g.name) as genres_joined
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      LEFT JOIN anime_genres ag ON a.id = ag.anime_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      ${whereSql}
    `;

    sql += ` GROUP BY a.id `;
    sql += buildAnimeOrderClause(sort);

    const listParams = [...params];
    if (limit) {
      sql += ` LIMIT ? OFFSET ? `;
      listParams.push(limit, offset || 0);
    }

    const rows = attachJoinedGenres(await query.all(sql, listParams));
    const translatedRows = await decorateAnimeListWithSpanishTranslation(rows, {
      maxRowsToTranslate: translateSynopsis ? Math.min(rows.length, 24) : 0
    });

    if (withTotal) {
      const countRow = await query.get(`
        SELECT COUNT(DISTINCT a.id) as total
        FROM anime a
        ${whereSql}
      `, params);
      return res.json({
        items: translatedRows,
        total: Number(countRow?.total) || 0,
        limit: limit || translatedRows.length,
        offset: offset || 0
      });
    }

    res.json(translatedRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /dashboard/summary - Datos livianos para Inicio
app.get('/dashboard/summary', async (_req, res) => {
  try {
    const cached = getCachedResponse(DASHBOARD_SUMMARY_CACHE_KEY);
    if (cached) {
      res.setHeader('X-MapleVault-Cache', 'hit');
      return res.json(cached);
    }

    const nonAdultCondition = `
      COALESCE(a.is_adult, 0) = 0
      AND a.id NOT IN (
        SELECT anime_id
        FROM anime_genres ag2
        JOIN genres g2 ON ag2.genre_id = g2.id
        WHERE g2.name = 'Hentai'
      )
      AND (
        a.age_rating IS NULL
        OR (a.age_rating NOT LIKE '%Rx%' AND a.age_rating NOT LIKE '%Hentai%')
      )
    `;

    const [totalRow, userListStats, favoriteRow, recentRows, airingRows] = await Promise.all([
      query.get(`SELECT COUNT(*) as count FROM anime a WHERE ${nonAdultCondition}`),
      query.all(`
        SELECT watch_status, COUNT(*) as count
        FROM user_list
        GROUP BY watch_status
      `),
      query.get(`SELECT COUNT(*) as count FROM user_list WHERE favorite = 1`),
      query.all(`
        SELECT a.id, a.title, a.title_romaji, a.title_english, a.title_japanese,
               a.year, a.season, a.status, a.type, a.episodes, a.score, a.popularity,
               a.cover_image, a.studio, a.is_adult,
               ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched,
               GROUP_CONCAT(DISTINCT g.name) as genres_joined
        FROM anime a
        LEFT JOIN user_list ul ON a.id = ul.anime_id
        LEFT JOIN anime_genres ag ON a.id = ag.anime_id
        LEFT JOIN genres g ON ag.genre_id = g.id
        WHERE ${nonAdultCondition}
        GROUP BY a.id
        ORDER BY a.id DESC
        LIMIT 4
      `),
      query.all(`
        SELECT a.id, a.title, a.title_romaji, a.title_english, a.title_japanese,
               a.year, a.season, a.status, a.type, a.episodes, a.score, a.popularity,
               a.cover_image, a.studio, a.is_adult,
               ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched,
               GROUP_CONCAT(DISTINCT g.name) as genres_joined
        FROM anime a
        LEFT JOIN user_list ul ON a.id = ul.anime_id
        LEFT JOIN anime_genres ag ON a.id = ag.anime_id
        LEFT JOIN genres g ON ag.genre_id = g.id
        WHERE ${nonAdultCondition}
          AND a.status = 'airing'
        GROUP BY a.id
        ORDER BY a.popularity DESC, a.score DESC, a.id DESC
        LIMIT 6
      `)
    ]);

    const byStatus = userListStats.reduce((acc: Record<string, number>, row: any) => {
      acc[row.watch_status] = Number(row.count) || 0;
      return acc;
    }, {});

    const [recentAdded, airingList] = await Promise.all([
      decorateAnimeListWithSpanishTranslation(attachJoinedGenres(recentRows), { maxRowsToTranslate: 0 }),
      decorateAnimeListWithSpanishTranslation(attachJoinedGenres(airingRows), { maxRowsToTranslate: 0 })
    ]);

    const payload = {
      stats: {
        total: Number(totalRow?.count) || 0,
        watching: byStatus.watching || 0,
        pending: byStatus.plan_to_watch || 0,
        completed: byStatus.completed || 0,
        favorites: Number(favoriteRow?.count) || 0
      },
      recentAdded,
      airingList
    };
    setCachedResponse(DASHBOARD_SUMMARY_CACHE_KEY, payload);
    res.setHeader('X-MapleVault-Cache', 'miss');
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /seasons/summary - Estadísticas agregadas para el explorador de temporadas
app.get('/seasons/summary', async (_req, res) => {
  try {
    const cached = getCachedResponse(SEASON_SUMMARY_CACHE_KEY);
    if (cached) {
      res.setHeader('X-MapleVault-Cache', 'hit');
      return res.json(cached);
    }

    const nonAdultCondition = `
      COALESCE(a.is_adult, 0) = 0
      AND a.id NOT IN (
        SELECT anime_id
        FROM anime_genres ag2
        JOIN genres g2 ON ag2.genre_id = g2.id
        WHERE g2.name = 'Hentai'
      )
      AND (
        a.age_rating IS NULL
        OR (a.age_rating NOT LIKE '%Rx%' AND a.age_rating NOT LIKE '%Hentai%')
      )
    `;

    const [yearRows, seasonRows, genreRows, studioRow] = await Promise.all([
      query.all(`
        SELECT DISTINCT a.year
        FROM anime a
        WHERE ${nonAdultCondition}
          AND a.year IS NOT NULL
        ORDER BY a.year DESC
      `),
      query.all(`
        SELECT a.year, a.season, COUNT(*) as count,
               AVG(CASE WHEN a.score > 0 THEN a.score END) as avg_score
        FROM anime a
        WHERE ${nonAdultCondition}
          AND a.year IS NOT NULL
          AND a.season IS NOT NULL
          AND a.season != ''
        GROUP BY a.year, a.season
        ORDER BY a.year DESC
      `),
      query.all(`
        SELECT g.name, COUNT(*) as count
        FROM anime a
        JOIN anime_genres ag ON a.id = ag.anime_id
        JOIN genres g ON ag.genre_id = g.id
        WHERE ${nonAdultCondition}
        GROUP BY g.id, g.name
        ORDER BY count DESC, g.name ASC
        LIMIT 3
      `),
      query.get(`
        SELECT a.studio, COUNT(*) as count
        FROM anime a
        WHERE ${nonAdultCondition}
          AND a.studio IS NOT NULL
          AND TRIM(a.studio) != ''
        GROUP BY a.studio
        ORDER BY count DESC, a.studio ASC
        LIMIT 1
      `)
    ]);

    const countsBySeason: Record<string, number> = {};
    let bestCountSeason = 'S/D';
    let bestCount = 0;
    let bestScoreSeason = 'S/D';
    let bestScore = 0;

    for (const row of seasonRows) {
      const year = Number(row.year);
      const season = String(row.season || '').toLowerCase();
      if (!year || !season) continue;

      const key = `${year}:${season}`;
      const count = Number(row.count) || 0;
      const avgScore = Number(row.avg_score) || 0;
      countsBySeason[key] = count;

      const label = `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
      if (count > bestCount) {
        bestCount = count;
        bestCountSeason = `${label} (${count} series)`;
      }
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestScoreSeason = `${label} (Nota: ${avgScore.toFixed(1)})`;
      }
    }

    const payload = {
      years: yearRows.map((row: any) => Number(row.year)).filter(Boolean),
      countsBySeason,
      comparisons: {
        bestCountSeason,
        bestScoreSeason,
        topGenres: genreRows.map((row: any) => row.name).filter(Boolean),
        topStudio: studioRow?.studio || 'S/D',
        studioCount: Number(studioRow?.count) || 0
      }
    };
    setCachedResponse(SEASON_SUMMARY_CACHE_KEY, payload);
    res.setHeader('X-MapleVault-Cache', 'miss');
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /anime/:id - Detalles de una serie
app.get('/anime/:id', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    const anime = await query.get(`
      SELECT a.*, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched, ul.notes, ul.started_at, ul.completed_at
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      WHERE a.id = ?
    `, [id]);

    if (!anime) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    // Cargar gneros
    const genres = await query.all(`
      SELECT g.name FROM anime_genres ag
      JOIN genres g ON ag.genre_id = g.id
      WHERE ag.anime_id = ?
    `, [id]);
    anime.genres = genres.map(g => g.name);

    const translatedAnime = await decorateAnimeWithSpanishTranslation(anime);
    res.json(translatedAnime);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /anime - Crear anime manualmente
app.post('/anime', async (req, res) => {
  try {
    if (!validateBodySize(res, req.body)) return;
    const validation = validateAnimePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Datos de anime inválidos.', details: validation.errors });
    }
    const a = validation.data;

    const result = await query.run(`
      INSERT INTO anime (
        title, title_romaji, title_english, title_japanese, synopsis, year, season,
        status, type, episodes, duration, score, popularity, cover_image, banner_image,
        studio, source_material, age_rating, start_date, end_date, official_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      a.title, a.title_romaji || '', a.title_english || '', a.title_japanese || '',
      a.synopsis || '', a.year || null, a.season || '', a.status || 'unknown',
      a.type || 'tv', a.episodes || null, a.duration || null, a.score || null,
      a.popularity || 0, a.cover_image || '', a.banner_image || '', a.studio || '',
      a.source_material || '', a.age_rating || '', a.start_date || '', a.end_date || '',
      a.official_url || ''
    ]);

    const newId = result.lastID;

    // Guardar gneros
    if (a.genres && Array.isArray(a.genres)) {
      for (const genreName of a.genres) {
        await query.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
        const genreRow = await query.get('SELECT id FROM genres WHERE name = ?', [genreName]);
        if (genreRow) {
          await query.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [newId, genreRow.id]);
        }
      }
    }

    invalidateLibraryReadCaches();
    res.status(201).json({ id: newId, message: 'Anime creado con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /anime/:id - Editar anime
app.put('/anime/:id', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    if (!validateBodySize(res, req.body)) return;
    const validation = validateAnimePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Datos de anime inválidos.', details: validation.errors });
    }
    const a = validation.data;

    const existing = await query.get('SELECT id FROM anime WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    await query.run(`
      UPDATE anime
      SET title = ?, title_romaji = ?, title_english = ?, title_japanese = ?,
          synopsis = ?, year = ?, season = ?, status = ?, type = ?, episodes = ?,
          duration = ?, score = ?, popularity = ?, cover_image = ?, banner_image = ?,
          studio = ?, source_material = ?, age_rating = ?, start_date = ?, end_date = ?,
          official_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      a.title, a.title_romaji || '', a.title_english || '', a.title_japanese || '',
      a.synopsis || '', a.year || null, a.season || '', a.status || 'unknown',
      a.type || 'tv', a.episodes || null, a.duration || null, a.score || null,
      a.popularity || 0, a.cover_image || '', a.banner_image || '', a.studio || '',
      a.source_material || '', a.age_rating || '', a.start_date || '', a.end_date || '',
      a.official_url || '', id
    ]);

    // Actualizar gneros (borrar y reinsertar)
    await query.run('DELETE FROM anime_genres WHERE anime_id = ?', [id]);
    if (a.genres && Array.isArray(a.genres)) {
      for (const genreName of a.genres) {
        await query.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
        const genreRow = await query.get('SELECT id FROM genres WHERE name = ?', [genreName]);
        if (genreRow) {
          await query.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [id, genreRow.id]);
        }
      }
    }

    invalidateLibraryReadCaches();
    res.json({ message: 'Anime actualizado con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /anime/:id - Eliminar anime del catlogo local
app.delete('/anime/:id', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    await query.run('DELETE FROM anime WHERE id = ?', [id]);
    invalidateLibraryReadCaches();
    res.json({ message: 'Anime eliminado del catlogo local' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /anime/clear - Limpiar catlogo sincronizado conservando o borrando lista de usuario
app.post('/anime/clear', async (req, res) => {
  try {
    const { keepUserList } = req.body;
    
    if (keepUserList === false) {
      // Borrado absoluto
      await query.run('DELETE FROM anime');
      await query.run('DELETE FROM user_list');
      await query.run('DELETE FROM watched_episodes');
      await query.run('DELETE FROM anime_genres');
      await query.run('DELETE FROM anime_relations');
      await query.run('DELETE FROM genres');
      invalidateLibraryReadCaches();
      res.json({ message: 'Se ha eliminado por completo todo el catlogo y tus listas personales.' });
    } else {
      // Borrado parcial: conservar animes en la lista del usuario.
      const resAnime = await query.run(`
        DELETE FROM anime 
        WHERE id NOT IN (SELECT anime_id FROM user_list)
      `);
      // Limpiar gneros hurfanos
      await query.run(`
        DELETE FROM genres 
        WHERE id NOT IN (SELECT genre_id FROM anime_genres)
      `);
      // Limpiar relaciones huérfanas
      await query.run(`
        DELETE FROM anime_relations 
        WHERE anime_id NOT IN (SELECT id FROM anime)
      `);
      invalidateLibraryReadCaches();
      res.json({ 
        message: `Catlogo sincronizado limpiado. Se eliminaron ${resAnime.changes} animes que no estaban en tu lista personal.`,
        deletedCount: resAnime.changes 
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /anime/:id/relations - Obtener solo precuelas y secuelas de anime
app.get('/anime/:id/relations', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    const rows = await query.all(`
      SELECT r.*, a.id as local_anime_id
      FROM anime_relations r
      LEFT JOIN anime a ON r.related_external_id = a.external_id AND a.source = 'AniList'
      WHERE r.anime_id = ?
        AND UPPER(COALESCE(r.relation_type, '')) IN ('PREQUEL', 'SEQUEL')
        AND UPPER(COALESCE(r.type, '')) = 'ANIME'
      ORDER BY CASE UPPER(r.relation_type) WHEN 'PREQUEL' THEN 0 ELSE 1 END, r.title
    `, [id]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. ENDPOINTS DE LISTA PERSONAL DE USUARIO
// ==========================================

// GET /user-list - Obtener lista personal con metadatos
app.get('/user-list', async (req, res) => {
  try {
    const { status, favorite } = req.query;
    let sql = `
      SELECT ul.*, a.title, a.title_romaji, a.title_english, a.title_japanese,
             a.synopsis, a.status, a.type, a.duration, a.cover_image, a.banner_image,
             a.studio, a.year, a.season, a.episodes, a.score as mal_score,
             GROUP_CONCAT(DISTINCT g.name) as genres_joined
      FROM user_list ul
      JOIN anime a ON ul.anime_id = a.id
      LEFT JOIN anime_genres ag ON a.id = ag.anime_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ` AND ul.watch_status = ? `;
      params.push(status);
    }
    if (favorite) {
      sql += ` AND ul.favorite = ? `;
      params.push(parseInt(favorite as string));
    }

    sql += ` GROUP BY ul.id `;

    sql += ` ORDER BY ul.updated_at DESC `;

    const rows = attachJoinedGenres(await query.all(sql, params));

    const translatedRows = await decorateAnimeListWithSpanishTranslation(rows);
    res.json(translatedRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /anime/external/anilist/:externalId - Consultar una ficha externa sin importarla
app.get('/anime/external/anilist/:externalId', async (req, res) => {
  try {
    const externalId = getValidatedId(req.params.externalId, res);
    if (!externalId) return;

    const anime = await getAniListAnimeById(externalId);
    if (!anime) {
      return res.status(404).json({ error: 'No se encontró la ficha solicitada en AniList.' });
    }

    const relatedIds = (anime.relations || [])
      .map(relation => Number(relation.related_external_id))
      .filter(Number.isInteger);
    const localRelations = relatedIds.length > 0
      ? await query.all(
          `SELECT id, external_id
           FROM anime
           WHERE source = 'AniList'
             AND external_id IN (${relatedIds.map(() => '?').join(', ')})`,
          relatedIds
        )
      : [];
    const localIdByExternalId = new Map(
      localRelations.map(row => [Number(row.external_id), Number(row.id)])
    );
    const decoratedAnime = {
      ...anime,
      relations: (anime.relations || []).map(relation => ({
        ...relation,
        local_anime_id: localIdByExternalId.get(Number(relation.related_external_id)) || null
      }))
    };

    res.json(await decorateAnimeWithSpanishTranslation(decoratedAnime));
  } catch {
    res.status(500).json({ error: 'No se pudo consultar la ficha vinculada.' });
  }
});

// POST /user-list - Agregar un anime a la lista personal
app.post('/user-list', async (req, res) => {
  try {
    if (!validateBodySize(res, req.body)) return;
    const validation = validateUserListInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Datos de lista inválidos.', details: validation.errors });
    }
    const { anime_id, watch_status, favorite, user_score, episodes_watched, notes } = req.body;

    await query.run(`
      INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, notes, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(anime_id) DO UPDATE SET
        watch_status = excluded.watch_status,
        favorite = excluded.favorite,
        user_score = excluded.user_score,
        episodes_watched = excluded.episodes_watched,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [
      anime_id, watch_status, favorite || 0, user_score || 0, episodes_watched || 0, notes || '',
      watch_status === 'watching' ? new Date().toISOString().split('T')[0] : null
    ]);

    invalidateLibraryReadCaches();
    res.status(201).json({ message: 'Anime agregado/actualizado en la lista personal' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /user-list/:id - Editar registro de lista personal
app.put('/user-list/:id', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    if (!validateBodySize(res, req.body)) return;
    const { watch_status, favorite, user_score, episodes_watched, notes, completed_at } = req.body;
    const validation = validateUserListInput({ anime_id: 1, watch_status, favorite, user_score, episodes_watched, notes });
    if (!validation.valid) {
      return res.status(400).json({ error: 'Datos de lista inválidos.', details: validation.errors });
    }

    const existing = await query.get('SELECT id, watch_status FROM user_list WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Registro no encontrado en tu lista' });
    }

    let end_date = completed_at;
    if (watch_status === 'completed' && existing.watch_status !== 'completed' && !completed_at) {
      end_date = new Date().toISOString().split('T')[0];
    }

    await query.run(`
      UPDATE user_list
      SET watch_status = ?, favorite = ?, user_score = ?, episodes_watched = ?,
          notes = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      watch_status, favorite || 0, user_score || 0, episodes_watched || 0,
      notes || '', end_date || null, id
    ]);

    invalidateLibraryReadCaches();
    res.json({ message: 'Lista personal actualizada con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /user-list/:id - Quitar anime de mi lista
app.delete('/user-list/:id', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    await query.run('DELETE FROM user_list WHERE id = ?', [id]);
    invalidateLibraryReadCaches();
    res.json({ message: 'Anime quitado de la lista personal' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. ENDPOINTS DE RECOMENDACIONES
// ==========================================
app.get('/recommendations', async (req, res) => {
  try {
    const cached = getCachedResponse(RECOMMENDATIONS_CACHE_KEY);
    if (cached) {
      res.setHeader('X-MapleVault-Cache', 'hit');
      return res.json(cached);
    }

    const recs = await getLocalRecommendations();
    const translatedRecs = await decorateAnimeListWithSpanishTranslation(recs, { maxRowsToTranslate: 10 });
    setCachedResponse(RECOMMENDATIONS_CACHE_KEY, translatedRecs, 60_000);
    res.setHeader('X-MapleVault-Cache', 'miss');
    res.json(translatedRecs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ENDPOINTS DE BSQUEDA Y SCRAPING EXTERNO
// ==========================================

// GET /search - Buscar en base de datos externa (AniList)
app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim() === '') {
      return res.json([]);
    }

    const externals = await searchAniList(String(q));
    const translatedExternals = await decorateAnimeListWithSpanishTranslation(externals, { maxRowsToTranslate: 10 });
    res.json(translatedExternals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /scraping/sync-season - Sincronizar toda una temporada
app.post('/scraping/sync-season', async (req, res) => {
  try {
    const { year, season } = req.body;
    if (!year || !season) {
      return res.status(400).json({ error: 'year y season son requeridos' });
    }

    const list = await syncSeasonFromAniList(parseInt(year), season);
    let savedCount = 0;
    
    for (const anime of list) {
      await saveNormalizedAnimeToLocal(anime);
      savedCount++;
    }

    invalidateLibraryReadCaches();
    res.json({ message: `Sincronización completada. Se añadieron o actualizaron ${savedCount} animes.`, count: savedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /scraping/sync-years - Scraping masivo desde año X hasta año actual
app.post('/scraping/sync-years', async (req, res) => {
  try {
    const { startYear } = req.body;
    if (!startYear) {
      return res.status(400).json({ error: 'El año de inicio (startYear) es requerido.' });
    }
    const parsedStart = parseInt(startYear, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(parsedStart) || parsedStart < 1970 || parsedStart > currentYear) {
      return res.status(400).json({ error: 'Año de inicio no válido.' });
    }

    // Ejecución asíncrona en segundo plano para no bloquear
    (async () => {
      await logScraping('Massive Scraping', `Sincronización masiva desde ${parsedStart}`, 'started', `Iniciando importación desde el año ${parsedStart} hasta ${currentYear}`);
      const seasons = ['winter', 'spring', 'summer', 'fall'];
      let totalImported = 0;
      
      for (let y = parsedStart; y <= currentYear; y++) {
        for (const s of seasons) {
          try {
            console.log(`[Massive Scraping] Sincronizando ${y} ${s}...`);
            const list = await syncSeasonFromAniList(y, s);
            let saved = 0;
            for (const anime of list) {
              await saveNormalizedAnimeToLocal(anime);
              saved++;
            }
            if (saved > 0) invalidateLibraryReadCaches();
            totalImported += saved;
            await logScraping('Massive Scraping', `Sincronización masiva: ${y} ${s}`, 'success', `Sincronizados ${saved} animes.`);
          } catch (err: any) {
            console.error(`Error en scraping masivo para ${y} ${s}:`, err.message);
            await logScraping('Massive Scraping', `Sincronización masiva: ${y} ${s}`, 'error', `Fallo: ${err.message}`);
          }
        }
      }
      invalidateLibraryReadCaches();
      await logScraping('Massive Scraping', `Sincronización masiva terminada`, 'success', `Sincronización masiva completada. Total de animes importados/actualizados: ${totalImported}`);
    })();

    res.json({ message: `Scraping masivo iniciado en segundo plano desde el año ${parsedStart} hasta ${currentYear}. Puedes ver el progreso en los logs de scraping.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /scraping/logs - Obtener logs de scraping
app.get('/scraping/logs', async (req, res) => {
  try {
    const logs = await query.all('SELECT * FROM scraping_logs ORDER BY id DESC LIMIT 50');
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /scraping/sources - Obtener fuentes
app.get('/scraping/sources', async (req, res) => {
  try {
    const sources = await query.all('SELECT * FROM sources');
    res.json(sources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /scraping/sources/:id - Modificar fuente
app.put('/scraping/sources/:id', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    const { enabled, rate_limit } = req.body;
    const safeRateLimit = Number(rate_limit);
    if (!Number.isInteger(safeRateLimit) || safeRateLimit < 250 || safeRateLimit > 60000) {
      return res.status(400).json({ error: 'rate_limit debe ser un entero entre 250 y 60000 ms.' });
    }
    await query.run(`
      UPDATE sources
      SET enabled = ?, rate_limit = ?, last_sync = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [enabled ? 1 : 0, safeRateLimit, id]);
    res.json({ message: 'Fuente actualizada con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. ENDPOINTS DE MAPLE ASSISTANT
// ==========================================

// GET /chat/capabilities - Contrato publico de capacidades del asistente
app.get('/chat/capabilities', (_req, res) => {
  res.json(getMapleAssistantCapabilities());
});

// POST /chat/message - Enviar mensaje
app.post('/chat/message', createRateLimitMiddleware('chat'), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'El mensaje es requerido y debe ser texto.' });
    }
    const safeMessage = sanitizeChatInput(message);
    if (safeMessage.length > 2000) {
      return res.status(400).json({ error: 'El mensaje no puede superar los 2000 caracteres.' });
    }
    const chatbotResponse = await handleChatMessage(safeMessage);
    res.json(chatbotResponse);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al procesar el mensaje.' });
  }
});

// POST /chat/execute-action - Ejecutar accin recomendada y confirmada por el usuario
// Requiere el confirmToken generado por el chatbot para validar la accin
app.post('/chat/execute-action', createRateLimitMiddleware('chat'), async (req, res) => {
  try {
    const { type, data, confirmToken } = req.body;
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: '"type" es requerido.' });
    }
    if (!isAllowedChatbotAction(type)) {
      return res.status(400).json({ error: 'Tipo de accin no permitido.' });
    }
    const msg = await executeChatbotAction(type, data || {}, confirmToken);
    res.json({ text: msg });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al ejecutar la accin.' });
  }
});

// GET /chat/history - Ver historial de chat
app.get('/chat/history', async (req, res) => {
  try {
    const rawHistory = await query.all('SELECT * FROM chat_messages ORDER BY id ASC');
    const history = rawHistory.map((msg: any) => {
      let visualData = undefined;
      let action = undefined;
      try { if (msg.visual_data) visualData = JSON.parse(msg.visual_data); } catch (e) {}
      try { if (msg.action) action = JSON.parse(msg.action); } catch (e) {}
      
      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        visualData,
        action
      };
    });
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /chat/history - Borrar historial de chat
app.delete('/chat/history', async (req, res) => {
  try {
    await query.run('DELETE FROM chat_messages');
    res.json({ message: 'Historial del chatbot borrado con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /chat/memory - Borrar memoria del chatbot
app.delete('/chat/memory', async (req, res) => {
  try {
    await clearAllMemory();
    res.json({ message: 'Memoria local del chatbot borrada con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/memory/profile - Perfil de gustos y rastro de memoria del usuario
app.get('/chat/memory/profile', async (_req, res) => {
  try {
    const profile = await getUserSoulData();
    res.json(profile || { message: 'Perfil de usuario no generado todavía.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chat/memory/profile - Recalcular perfil de gustos desde SQLite
app.post('/chat/memory/profile', async (_req, res) => {
  try {
    const profile = await buildUserSoulProfile();
    res.json({ message: 'Perfil de memoria, gustos y alma generado con éxito.', profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /settings/ai - Obtener configuracin de IA
app.get('/settings/ai', async (req, res) => {
  try {
    const settings = await getAISettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/ai - Guardar configuracin de IA
app.post('/settings/ai', async (req, res) => {
  try {
    const validatedUrl = validateLocalServiceUrl(req.body?.url);
    if (!validatedUrl.valid) {
      return res.status(400).json({ error: validatedUrl.reason });
    }
    await setAISettings(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /settings/ai - Restablecer configuracin de IA
app.delete('/settings/ai', async (req, res) => {
  try {
    await resetAISettings();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/ai/seed - Generar memoria inicial
app.post('/settings/ai/seed', async (req, res) => {
  try {
    await seedInitialMemory();
    const profile = await buildUserSoulProfile();
    res.json({ message: 'Memoria inicial y perfil de gustos generados con éxito.', profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/ai/test - Probar conexión con Ollama
app.post('/settings/ai/test', async (req, res) => {
  try {
    const { url, provider, model } = req.body;
    const validatedUrl = validateLocalServiceUrl(url);
    if (!validatedUrl.valid) {
      return res.status(400).json({ success: false, message: validatedUrl.reason });
    }

    let endpoint = `${validatedUrl.url}/api/tags`;
    if (provider !== 'ollama') {
       // Si es llama.cpp o LM Studio normalmente responden en /v1/models o solo queremos ver si levanta HTTP
       endpoint = `${validatedUrl.url}/v1/models`;
    }
    
    // Test simple de red
    const result = await axios.get(endpoint, { timeout: 3000, maxRedirects: 0 });

    // Si es Ollama, validar si el modelo solicitado está instalado
    if (provider === 'ollama' && model) {
      const models = result.data.models || [];
      const modelExists = models.some((m: any) => m.name === model || m.name.startsWith(model + ':'));
      if (!modelExists) {
        return res.status(400).json({ 
          success: false, 
          message: `Ollama está conectado, pero no se encontró el modelo "${model}".\nAbre tu terminal e instala el modelo ejecutando:\nollama run ${model}` 
        });
      }
    }

    res.json({ success: true, message: 'Conexin establecida correctamente.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: 'Error de conexión: ' + err.message });
  }
});

// ==========================================
// 6. AJUSTES, EXPORTACIN E IMPORTACIN
// ==========================================

// GET /settings - Ver ajustes
app.get('/settings', (req, res) => {
  const settings = loadSettings();
  res.json(settings);
});

// POST /settings - Guardar ajustes
app.post('/settings', (req, res) => {
  try {
    if (!validateBodySize(res, req.body)) return;
    if (req.body?.translation?.url !== undefined) {
      const validatedUrl = validateLocalServiceUrl(req.body.translation.url);
      if (!validatedUrl.valid) {
        return res.status(400).json({ error: validatedUrl.reason });
      }
    }
    const current = loadSettings();
    const allowedCloseBehaviors = new Set(['ask', 'minimize', 'quit']);
    const newSettings = enforceSupportedAppearance({
      ...current,
      closeBehavior: allowedCloseBehaviors.has(req.body?.closeBehavior) ? req.body.closeBehavior : current.closeBehavior || 'ask',
      translation: normalizeTranslationSettingsForStorage(req.body?.translation, current.translation)
    });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(newSettings, null, 2), 'utf8');
    res.json({ message: 'Ajustes guardados con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /translation/status - Estado del servicio de traduccion local
app.get('/translation/status', async (_req, res) => {
  try {
    res.json(await getLibreTranslateRuntimeStatus());
  } catch (err: any) {
    res.status(500).json({ state: 'error', error: err.message });
  }
});

// POST /settings/export - Exportar catlogo completo a JSON
app.post('/settings/export', async (req, res) => {
  try {
    const animes = attachJoinedGenres(await query.all(`
      SELECT a.*, GROUP_CONCAT(DISTINCT g.name) as genres_joined
      FROM anime a
      LEFT JOIN anime_genres ag ON a.id = ag.anime_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      GROUP BY a.id
      ORDER BY a.id ASC
    `));
    const userList = await query.all('SELECT * FROM user_list');

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      animes,
      userList
    };

    res.json(exportData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/import - Importar catlogo desde JSON
app.post('/settings/import', async (req, res) => {
  try {
    if (!validateBodySize(res, req.body)) return;
    const { animes, userList } = req.body;
    
    if (!animes || !Array.isArray(animes)) {
      return res.status(400).json({ error: 'Formato de importacin invlido' });
    }

    let importedAnimes = 0;
    let importedUserItems = 0;

    for (const a of animes) {
      const validation = validateAnimePayload(a);
      if (!validation.valid) {
        continue;
      }
      const safeAnime = validation.data;
      // 1. Guardar o actualizar anime
      const animeId = await saveNormalizedAnimeToLocal({
        external_id: safeAnime.external_id || safeAnime.id || null,
        source: safeAnime.source || 'Import',
        title: safeAnime.title,
        title_romaji: safeAnime.title_romaji,
        title_english: safeAnime.title_english,
        title_japanese: safeAnime.title_japanese,
        synopsis: safeAnime.synopsis,
        year: safeAnime.year,
        season: safeAnime.season,
        status: safeAnime.status,
        type: safeAnime.type,
        episodes: safeAnime.episodes,
        duration: safeAnime.duration,
        score: safeAnime.score,
        popularity: safeAnime.popularity,
        cover_image: safeAnime.cover_image,
        banner_image: safeAnime.banner_image,
        studio: safeAnime.studio,
        source_material: safeAnime.source_material,
        start_date: safeAnime.start_date,
        end_date: safeAnime.end_date,
        genres: safeAnime.genres || []
      });
      importedAnimes++;

      // 2. Si el anime estaba en el userList importado, agregarlo
      const userItem = userList?.find((u: any) => u.anime_id === a.id);
      if (userItem) {
        const userValidation = validateUserListInput({ ...userItem, anime_id: animeId });
        if (!userValidation.valid) continue;
        await query.run(`
          INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, notes, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(anime_id) DO UPDATE SET
            watch_status = excluded.watch_status,
            favorite = excluded.favorite,
            user_score = excluded.user_score,
            episodes_watched = excluded.episodes_watched,
            notes = excluded.notes,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            updated_at = CURRENT_TIMESTAMP
        `, [
          animeId, userItem.watch_status, userItem.favorite, userItem.user_score,
          userItem.episodes_watched, userItem.notes, userItem.started_at, userItem.completed_at
        ]);
        importedUserItems++;
      }
    }

    res.json({ message: `Importación completada. Se importaron ${importedAnimes} animes y ${importedUserItems} elementos de lista.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/backup - Crear copia de seguridad de la base de datos
app.post('/settings/backup', async (req, res) => {
  try {
    const result = await createBackup();
    if (result.success) {
      res.json({
        message: 'Copia de seguridad creada.',
        path: result.path,
        filename: result.path ? path.basename(result.path) : null
      });
    } else {
      res.status(500).json({ error: result.error || 'No se pudo crear la copia de seguridad.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /genres - Obtener gneros en catlogo local
app.get('/genres', async (req, res) => {
  try {
    const genres = await query.all('SELECT name FROM genres ORDER BY name ASC');
    res.json(genres.map(g => g.name));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. ENDPOINTS DE EPISODIOS (ANIMEAV1)
// ==========================================

// GET /anime/:id/episodes - Obtener listado de episodios desde AnimeAV1
app.get('/anime/:id/episodes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Obtener detalles locales del anime
    const anime = await query.get(
      'SELECT id, title, title_romaji, title_english, animeav1_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    let slug = anime.animeav1_slug;

    // Si no tenemos el slug guardado, buscarlo
    if (!slug) {
      slug = await getAnimeAV1Slug(anime.title, anime.title_romaji, anime.title_english);
      if (slug) {
        // Guardar el slug en la base de datos para futuras peticiones
        await query.run('UPDATE anime SET animeav1_slug = ? WHERE id = ?', [slug, id]);
      }
    }

    if (!slug) {
      return res.status(404).json({ error: 'No se encontr este anime en AnimeAV1' });
    }

    const episodes = await getAnimeAV1Episodes(slug);
    res.json({ slug, episodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /anime/:id/watched-episodes - Obtener la lista de nmeros de episodios vistos
app.get('/anime/:id/watched-episodes', async (req, res) => {
  try {
    const id = getValidatedId(req.params.id, res);
    if (!id) return;
    const rows = await query.all('SELECT episode_number FROM watched_episodes WHERE anime_id = ?', [id]);
    res.json(rows.map((r: any) => r.episode_number));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /anime/:id/episodes/:number/watch - Alternar el estado de visto de un episodio
app.post('/anime/:id/episodes/:number/watch', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const num = parseInt(req.params.number, 10);
    const { watched } = req.body;

    if (isNaN(id) || isNaN(num)) {
      return res.status(400).json({ error: 'Parmetros invlidos.' });
    }

    if (watched) {
      await query.run('INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)', [id, num]);
    } else {
      await query.run('DELETE FROM watched_episodes WHERE anime_id = ? AND episode_number = ?', [id, num]);
    }

    // Actualizar episodes_watched en user_list
    const countRow = await query.get('SELECT COUNT(*) as cnt FROM watched_episodes WHERE anime_id = ?', [id]);
    const watchedCount = countRow ? countRow.cnt : 0;

    await query.run('UPDATE user_list SET episodes_watched = ?, updated_at = CURRENT_TIMESTAMP WHERE anime_id = ?', [watchedCount, id]);

    res.json({ success: true, watched, watchedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /anime/:id/episodes/:number - Obtener reproductores para un captulo especfico
app.get('/anime/:id/episodes/:number', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const number = parseInt(req.params.number);

    // Obtener detalles locales del anime
    const anime = await query.get(
      'SELECT id, animeav1_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    if (!anime.animeav1_slug) {
      return res.status(404).json({ error: 'Anime no tiene un slug de AnimeAV1 asociado' });
    }

    const embeds = await getAnimeAV1Embeds(anime.animeav1_slug, number);
    res.json(prioritizeServers(embeds));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper para priorizar servidores (Mega / 1fichier al principio)
function prioritizeServers(servers: any): any {
  if (Array.isArray(servers)) {
    return [...servers].sort((a, b) => {
      const aName = String(a.server || a.name || '').toLowerCase();
      const bName = String(b.server || b.name || '').toLowerCase();
      const aPri = (aName.includes('mega') || aName.includes('1fichier')) ? 1 : 0;
      const bPri = (bName.includes('mega') || bName.includes('1fichier')) ? 1 : 0;
      return bPri - aPri; // prioritario primero
    });
  }
  if (servers && typeof servers === 'object') {
    const result: any = {};
    for (const key in servers) {
      if (Array.isArray(servers[key])) {
        result[key] = prioritizeServers(servers[key]);
      } else {
        result[key] = servers[key];
      }
    }
    return result;
  }
  return servers;
}

// ==========================================
// ENDPOINTS DE TIOANIME (fuente alternativa)
// ==========================================

// GET /tioanime/:id/episodes - Buscar y listar episodios de TioAnime
app.get('/tioanime/:id/episodes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const anime = await query.get(
      'SELECT id, title, title_romaji, title_english, tioanime_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime) return res.status(404).json({ error: 'Anime no encontrado' });

    let slug = anime.tioanime_slug;

    if (!slug) {
      slug = await getTioAnimeSlug(anime.title, anime.title_romaji, anime.title_english);
      if (slug) {
        try {
          await query.run('UPDATE anime SET tioanime_slug = ? WHERE id = ?', [slug, id]);
        } catch (_) {}
      }
    }

    if (!slug) return res.status(404).json({ error: 'No se encontr este anime en TioAnime' });

    const episodes = await getTioAnimeEpisodes(slug);
    res.json({ slug, episodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tioanime/:id/episodes/:number/servers - Obtener servidores de video de un episodio de TioAnime
app.get('/tioanime/:id/episodes/:number/servers', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const number = parseInt(req.params.number);

    const anime = await query.get(
      'SELECT id, tioanime_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime || !anime.tioanime_slug) {
      return res.status(404).json({ error: 'No se encontr el slug de TioAnime para este anime. Primero llama a GET /tioanime/:id/episodes.' });
    }

    const episodeUrl = `https://tioanime.com/ver/${anime.tioanime_slug}-${number}`;
    const servers = await getTioAnimeServers(episodeUrl);
    res.json(prioritizeServers(servers));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINTS DE JKANIME
// ==========================================

// GET /jkanime/:id/episodes - Buscar y listar episodios de JKAnime
app.get('/jkanime/:id/episodes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const anime = await query.get(
      'SELECT id, title, title_romaji, title_english, jkanime_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime) return res.status(404).json({ error: 'Anime no encontrado' });

    let slug = anime.jkanime_slug;

    if (!slug) {
      slug = await getJKAnimeSlug(anime.title, anime.title_romaji, anime.title_english);
      if (slug) {
        try {
          await query.run('UPDATE anime SET jkanime_slug = ? WHERE id = ?', [slug, id]);
        } catch (_) {}
      }
    }

    if (!slug) return res.status(404).json({ error: 'No se encontr este anime en JKAnime' });

    const episodes = await getJKAnimeEpisodes(slug);
    res.json({ slug, episodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jkanime/:id/episodes/:number/servers - Obtener servidores de un episodio de JKAnime
app.get('/jkanime/:id/episodes/:number/servers', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const number = parseInt(req.params.number);

    const anime = await query.get(
      'SELECT id, jkanime_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime || !anime.jkanime_slug) {
      return res.status(404).json({ error: 'No se encontr el slug de JKAnime para este anime. Primero llama a GET /jkanime/:id/episodes.' });
    }

    const episodeUrl = `https://jkanime.net/${anime.jkanime_slug}/${number}/`;
    const servers = await getJKAnimeServers(episodeUrl);
    res.json(prioritizeServers(servers));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINTS DE ANIMEFLV
// ==========================================

// GET /animeflv/:id/episodes - Buscar y listar episodios de AnimeFLV
app.get('/animeflv/:id/episodes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const anime = await query.get(
      'SELECT id, title, title_romaji, title_english, animeflv_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime) return res.status(404).json({ error: 'Anime no encontrado' });

    let slug = anime.animeflv_slug;

    if (!slug) {
      slug = await getAnimeFLVSlug(anime.title, anime.title_romaji, anime.title_english);
      if (slug) {
        try {
          await query.run('UPDATE anime SET animeflv_slug = ? WHERE id = ?', [slug, id]);
        } catch (_) {}
      }
    }

    if (!slug) return res.status(404).json({ error: 'No se encontr este anime en AnimeFLV' });

    const episodes = await getAnimeFLVEpisodes(slug);
    res.json({ slug, episodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /animeflv/:id/episodes/:number/servers - Obtener servidores de un episodio de AnimeFLV
app.get('/animeflv/:id/episodes/:number/servers', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const number = parseInt(req.params.number);

    const anime = await query.get(
      'SELECT id, animeflv_slug FROM anime WHERE id = ?',
      [id]
    );

    if (!anime || !anime.animeflv_slug) {
      return res.status(404).json({ error: 'No se encontr el slug de AnimeFLV para este anime. Primero llama a GET /animeflv/:id/episodes.' });
    }

    const episodeUrl = `https://www3.animeflv.net/ver/${anime.animeflv_slug}-${number}`;
    const servers = await getAnimeFLVServers(episodeUrl);
    res.json(prioritizeServers(servers));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /health - Sondeo de salud del servidor
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// POST /anime/import - Importar anime de internet
app.post('/anime/import', async (req, res) => {
  try {
    if (!validateBodySize(res, req.body)) return;
    const validation = validateAnimePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Datos de anime inválidos.', details: validation.errors });
    }
    const localId = await saveNormalizedAnimeToLocal(validation.data as any);
    invalidateLibraryReadCaches();
    res.json({ id: localId, message: 'Anime importado con éxito' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. ENDPOINTS DE BACKUP DE BASE DE DATOS
// ==========================================

// GET /backup/list - Listar backups disponibles
app.get('/backup/list', async (_req, res) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /backup/create - Crear backup manual
app.post('/backup/create', async (_req, res) => {
  try {
    const result = await createBackup();
    if (result.success) {
      res.json({
        message: 'Copia de seguridad creada con éxito.',
        path: result.path,
        filename: result.path ? path.basename(result.path) : null
      });
    } else {
      res.status(500).json({ error: result.error || 'No se pudo crear la copia de seguridad.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /backup/restore - Restaurar desde backup
app.post('/backup/restore', async (req, res) => {
  try {
    const { backupPath } = req.body;
    if (!backupPath || typeof backupPath !== 'string') {
      return res.status(400).json({ error: 'Se requiere el campo backupPath.' });
    }
    const result = await restoreBackup(backupPath);
    if (result.success) {
      res.json({ message: 'Base de datos restaurada. Reinicia la aplicación para que los cambios surtan efecto.' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /backup/:name - Eliminar un backup especfico
app.delete('/backup/:name', async (req, res) => {
  try {
    const name = req.params.name;
    // Validar que el nombre no contenga path traversal
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
      return res.status(400).json({ error: 'Nombre de copia de seguridad no válido.' });
    }

    const backupDir = path.join(path.dirname(DB_PATH), 'backups');
    const fullPath = path.join(backupDir, name);

    const result = deleteBackup(fullPath);
    if (result.success) {
      res.json({ message: 'Copia de seguridad eliminada.' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /maintenance/duplicates - Vista previa segura de duplicados
app.get('/maintenance/duplicates', async (_req, res) => {
  try {
    const groups = await query.all(`
      SELECT LOWER(title) as normalized_title,
             COALESCE(year, 0) as year,
             COUNT(*) as count,
             GROUP_CONCAT(id) as ids,
             GROUP_CONCAT(source) as sources
      FROM anime
      GROUP BY normalized_title, year
      HAVING COUNT(*) > 1
      ORDER BY count DESC, normalized_title ASC
    `);
    res.json(groups.map((group: any) => ({
      ...group,
      ids: String(group.ids || '').split(',').filter(Boolean).map(Number),
      sources: String(group.sources || '').split(',').filter(Boolean)
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chat/actions/history - Auditoria reciente de acciones del asistente
app.get('/chat/actions/history', async (_req, res) => {
  try {
    const rows = await query.all(`
      SELECT id, user_prompt, detected_intent, nlp_engine, selected_tool, requires_confirmation,
             execution_status, latency_ms, error_message, created_at
      FROM assistant_prompt_runs
      ORDER BY id DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /system/health - Estado del sistema
app.get('/system/health', async (_req, res) => {
  try {
    const animeCount = await query.get('SELECT COUNT(*) as c FROM anime');
    const listCount = await query.get('SELECT COUNT(*) as c FROM user_list');
    const backups = listBackups();

    res.json({
      status: 'ok',
      database: {
        connected: true,
        animeCount: animeCount?.c || 0,
        userListCount: listCount?.c || 0,
        dbPath: DB_PATH
      },
      backup: {
        count: backups.length,
        latest: backups[0]?.createdAt || null
      },
      uptime: process.uptime()
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /system/diagnostics - Diagnostico ampliado local
app.get('/system/diagnostics', async (_req, res) => {
  try {
    const [animeCount, listCount] = await Promise.all([
      query.get('SELECT COUNT(*) as c FROM anime'),
      query.get('SELECT COUNT(*) as c FROM user_list')
    ]);
    const settings = await getAISettings();
    const sources = await query.all('SELECT name, enabled, rate_limit, last_sync FROM sources ORDER BY name ASC');
    const backups = listBackups();

    res.json({
      app: 'MapleVault',
      status: 'ok',
      database: {
        connected: true,
        path: DB_PATH,
        animeCount: animeCount?.c || 0,
        userListCount: listCount?.c || 0
      },
      assistant: {
        provider: settings.provider,
        model: settings.model,
        enabled: settings.enabled,
        url: settings.url
      },
      scraping: {
        sources
      },
      backup: {
        count: backups.length,
        latest: backups[0]?.createdAt || null
      },
      uptime: process.uptime()
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
async function start() {
  try {
    await initDb();

    try {
      const translationStatus = await ensureLibreTranslateRunning();
      console.log(`[MapleVault] LibreTranslate: ${translationStatus.state}${translationStatus.command ? ` (${translationStatus.command})` : ''}`);
      if (translationStatus.lastError) {
        console.warn('[MapleVault] LibreTranslate no se pudo iniciar automaticamente:', translationStatus.lastError);
      }
      if (translationStatus.attempts?.length) {
        console.warn('[MapleVault] Intentos de LibreTranslate:', translationStatus.attempts.join(' | '));
      }
      if (translationStatus.installHint) {
        console.warn('[MapleVault] LibreTranslate:', translationStatus.installHint);
      }
    } catch (err: any) {
      console.warn('[MapleVault] Error iniciando LibreTranslate automaticamente:', err.message);
    }

    // Backup automtico al arrancar (si no hay uno reciente < 24h)
    const backups = listBackups();
    const now = Date.now();
    const hasRecentBackup = backups.some(b => {
      const age = now - new Date(b.createdAt).getTime();
      return age < 24 * 60 * 60 * 1000; // menos de 24 horas
    });

    if (!hasRecentBackup) {
      const result = await createBackup();
      if (result.success) {
        console.log(`[MapleVault] Backup automtico creado: ${result.path}`);
      } else {
        console.warn('[MapleVault] No se pudo crear backup automtico:', result.error);
      }
    }

    // Programar backup peridico (cada 24 horas)
    setInterval(async () => {
      try {
        const res = await createBackup();
        if (res.success) {
          console.log(`[MapleVault] Backup peridico creado: ${res.path}`);
        }
      } catch (err: any) {
        console.warn('[MapleVault] Error en backup peridico:', err.message);
      }
    }, 24 * 60 * 60 * 1000);

    app.listen(PORT, HOST, () => {
      console.log(`Servidor de MapleVault corriendo en http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar el servidor de MapleVault:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

process.once('SIGINT', () => {
  stopLibreTranslateRuntime();
  process.exit(0);
});

process.once('SIGTERM', () => {
  stopLibreTranslateRuntime();
  process.exit(0);
});

process.once('exit', () => {
  stopLibreTranslateRuntime();
});

export { app, start };
