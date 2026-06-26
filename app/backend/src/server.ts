import express from 'express';
import cors from 'cors';
import { initDb, query } from './database/db';
import { searchAniList, getAniListAnimeById, saveNormalizedAnimeToLocal } from './scraping/scraper';
import { getLocalRecommendations } from './recommendations/recommender';
import { createRateLimitMiddleware } from './security/rateLimiter';
import { createSessionAuthMiddleware } from './security/sessionAuth';
import { validateUserListInput, validateSearchFilters, validateId, validatePayloadSize } from './security/validators';
import { createBackup, listBackups } from './database/backup';
import { decorateAnimeListWithSpanishTranslation, decorateAnimeWithSpanishTranslation } from './translation/translationService';
import { ensureLibreTranslateRunning, stopLibreTranslateRuntime } from './translation/translationRuntime';
import { attachJoinedGenres } from './anime/animeRows';
import { validateAnimePayload } from './anime/animePayload';
import { createAssistantRouter } from './routes/assistantRoutes';
import { createBackupRouter } from './routes/backupRoutes';
import { createDataTransferRouter } from './routes/dataTransferRoutes';
import { createEpisodeRouter } from './routes/episodeRoutes';
import { createSettingsRouter } from './routes/settingsRoutes';
import { createScrapingRouter } from './routes/scrapingRoutes';
import { createSystemRouter } from './routes/systemRoutes';

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

const DASHBOARD_SUMMARY_CACHE_KEY = 'dashboard:summary';
const SEASON_SUMMARY_CACHE_KEY = 'seasons:summary';
const RECOMMENDATIONS_CACHE_KEY = 'recommendations:local';
const SUMMARY_CACHE_TTL_MS = Number(process.env.MAPLEVAULT_SUMMARY_CACHE_TTL_MS || 30_000);

const responseCache = new Map<string, { expiresAt: number; value: any }>();

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

app.use(createBackupRouter({ invalidateLibraryReadCaches }));
app.use(createDataTransferRouter({ invalidateLibraryReadCaches }));
app.use(createSettingsRouter());
app.use(createScrapingRouter({ invalidateLibraryReadCaches }));
app.use(createAssistantRouter());
app.use(createEpisodeRouter());
app.use(createSystemRouter());

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

// GET /genres - Obtener gneros en catlogo local
app.get('/genres', async (req, res) => {
  try {
    const genres = await query.all('SELECT name FROM genres ORDER BY name ASC');
    res.json(genres.map(g => g.name));
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
