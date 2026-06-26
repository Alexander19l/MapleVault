import { Router } from 'express';
import type { Response } from 'express';
import { attachJoinedGenres } from '../anime/animeRows';
import { validateAnimePayload } from '../anime/animePayload';
import { query } from '../database/db';
import { getLocalRecommendations } from '../recommendations/recommender';
import {
  getAniListAnimeById,
  saveNormalizedAnimeToLocal,
  searchAniList
} from '../scraping/scraper';
import {
  validateId,
  validatePayloadSize,
  validateSearchFilters,
  validateUserListInput
} from '../security/validators';
import {
  decorateAnimeListWithSpanishTranslation,
  decorateAnimeWithSpanishTranslation
} from '../translation/translationService';
import {
  getCachedResponse,
  libraryCacheKeys,
  setCachedResponse,
  invalidateLibraryReadCaches
} from './libraryCache';

type QueryClient = Pick<typeof query, 'get' | 'all' | 'run'>;

interface ExternalAnimeService {
  searchAniList: typeof searchAniList;
  getAniListAnimeById: typeof getAniListAnimeById;
  saveNormalizedAnimeToLocal: typeof saveNormalizedAnimeToLocal;
}

interface TranslationService {
  decorateAnimeListWithSpanishTranslation: typeof decorateAnimeListWithSpanishTranslation;
  decorateAnimeWithSpanishTranslation: typeof decorateAnimeWithSpanishTranslation;
}

interface LibraryRouterDependencies {
  queryClient?: QueryClient;
  externalAnimeService?: ExternalAnimeService;
  recommendationService?: typeof getLocalRecommendations;
  translationService?: TranslationService;
  attachGenres?: typeof attachJoinedGenres;
  invalidateReadCaches?: () => void;
  getCurrentDate?: () => Date;
}

const defaultExternalAnimeService: ExternalAnimeService = {
  searchAniList,
  getAniListAnimeById,
  saveNormalizedAnimeToLocal
};

const defaultTranslationService: TranslationService = {
  decorateAnimeListWithSpanishTranslation,
  decorateAnimeWithSpanishTranslation
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error interno en biblioteca.';
}

function validateBodySize(res: Response, body: unknown): boolean {
  if (!validatePayloadSize(body)) {
    res.status(413).json({ error: 'Payload demasiado grande.' });
    return false;
  }
  return true;
}

function getValidatedId(rawId: unknown, res: Response): number | null {
  const id = validateId(rawId);
  if (!id) {
    res.status(400).json({ error: 'ID invalido.' });
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
    // Explicit searches may return adult matches if the user asks for them.
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

function buildNonAdultCondition() {
  return `
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
}

export function createLibraryRouter({
  queryClient = query,
  externalAnimeService = defaultExternalAnimeService,
  recommendationService = getLocalRecommendations,
  translationService = defaultTranslationService,
  attachGenres = attachJoinedGenres,
  invalidateReadCaches = invalidateLibraryReadCaches,
  getCurrentDate = () => new Date()
}: LibraryRouterDependencies = {}) {
  const router = Router();

  router.get('/anime', async (req, res) => {
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

      const rows = attachGenres(await queryClient.all(sql, listParams));
      const translatedRows = await translationService.decorateAnimeListWithSpanishTranslation(rows, {
        maxRowsToTranslate: translateSynopsis ? Math.min(rows.length, 24) : 0
      });

      if (withTotal) {
        const countRow = await queryClient.get(`
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
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/dashboard/summary', async (_req, res) => {
    try {
      const cached = getCachedResponse(libraryCacheKeys.dashboardSummary);
      if (cached) {
        res.setHeader('X-MapleVault-Cache', 'hit');
        return res.json(cached);
      }

      const nonAdultCondition = buildNonAdultCondition();
      const [totalRow, userListStats, favoriteRow, recentRows, airingRows] = await Promise.all([
        queryClient.get(`SELECT COUNT(*) as count FROM anime a WHERE ${nonAdultCondition}`),
        queryClient.all(`
          SELECT watch_status, COUNT(*) as count
          FROM user_list
          GROUP BY watch_status
        `),
        queryClient.get(`SELECT COUNT(*) as count FROM user_list WHERE favorite = 1`),
        queryClient.all(`
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
        queryClient.all(`
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
        translationService.decorateAnimeListWithSpanishTranslation(attachGenres(recentRows), { maxRowsToTranslate: 0 }),
        translationService.decorateAnimeListWithSpanishTranslation(attachGenres(airingRows), { maxRowsToTranslate: 0 })
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
      setCachedResponse(libraryCacheKeys.dashboardSummary, payload);
      res.setHeader('X-MapleVault-Cache', 'miss');
      res.json(payload);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/seasons/summary', async (_req, res) => {
    try {
      const cached = getCachedResponse(libraryCacheKeys.seasonSummary);
      if (cached) {
        res.setHeader('X-MapleVault-Cache', 'hit');
        return res.json(cached);
      }

      const nonAdultCondition = buildNonAdultCondition();
      const [yearRows, seasonRows, genreRows, studioRow] = await Promise.all([
        queryClient.all(`
          SELECT DISTINCT a.year
          FROM anime a
          WHERE ${nonAdultCondition}
            AND a.year IS NOT NULL
          ORDER BY a.year DESC
        `),
        queryClient.all(`
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
        queryClient.all(`
          SELECT g.name, COUNT(*) as count
          FROM anime a
          JOIN anime_genres ag ON a.id = ag.anime_id
          JOIN genres g ON ag.genre_id = g.id
          WHERE ${nonAdultCondition}
          GROUP BY g.id, g.name
          ORDER BY count DESC, g.name ASC
          LIMIT 3
        `),
        queryClient.get(`
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
      setCachedResponse(libraryCacheKeys.seasonSummary, payload);
      res.setHeader('X-MapleVault-Cache', 'miss');
      res.json(payload);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/anime/:id', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;

      const anime = await queryClient.get(`
        SELECT a.*, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched, ul.notes, ul.started_at, ul.completed_at
        FROM anime a
        LEFT JOIN user_list ul ON a.id = ul.anime_id
        WHERE a.id = ?
      `, [id]);

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      const genres = await queryClient.all(`
        SELECT g.name FROM anime_genres ag
        JOIN genres g ON ag.genre_id = g.id
        WHERE ag.anime_id = ?
      `, [id]);
      anime.genres = genres.map((genre: any) => genre.name);

      const translatedAnime = await translationService.decorateAnimeWithSpanishTranslation(anime);
      res.json(translatedAnime);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/anime', async (req, res) => {
    try {
      if (!validateBodySize(res, req.body)) return;
      const validation = validateAnimePayload(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Datos de anime invalidos.', details: validation.errors });
      }
      const a = validation.data;

      const result = await queryClient.run(`
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
      if (a.genres && Array.isArray(a.genres)) {
        for (const genreName of a.genres) {
          await queryClient.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
          const genreRow = await queryClient.get('SELECT id FROM genres WHERE name = ?', [genreName]);
          if (genreRow) {
            await queryClient.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [newId, genreRow.id]);
          }
        }
      }

      invalidateReadCaches();
      res.status(201).json({ id: newId, message: 'Anime creado con exito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.put('/anime/:id', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;
      if (!validateBodySize(res, req.body)) return;

      const validation = validateAnimePayload(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Datos de anime invalidos.', details: validation.errors });
      }
      const a = validation.data;

      const existing = await queryClient.get('SELECT id FROM anime WHERE id = ?', [id]);
      if (!existing) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      await queryClient.run(`
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

      await queryClient.run('DELETE FROM anime_genres WHERE anime_id = ?', [id]);
      if (a.genres && Array.isArray(a.genres)) {
        for (const genreName of a.genres) {
          await queryClient.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
          const genreRow = await queryClient.get('SELECT id FROM genres WHERE name = ?', [genreName]);
          if (genreRow) {
            await queryClient.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [id, genreRow.id]);
          }
        }
      }

      invalidateReadCaches();
      res.json({ message: 'Anime actualizado con exito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.delete('/anime/:id', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;
      await queryClient.run('DELETE FROM anime WHERE id = ?', [id]);
      invalidateReadCaches();
      res.json({ message: 'Anime eliminado del catalogo local' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/anime/clear', async (req, res) => {
    try {
      const { keepUserList } = req.body;

      if (keepUserList === false) {
        await queryClient.run('DELETE FROM anime');
        await queryClient.run('DELETE FROM user_list');
        await queryClient.run('DELETE FROM watched_episodes');
        await queryClient.run('DELETE FROM anime_genres');
        await queryClient.run('DELETE FROM anime_relations');
        await queryClient.run('DELETE FROM genres');
        invalidateReadCaches();
        res.json({ message: 'Se ha eliminado por completo todo el catalogo y tus listas personales.' });
      } else {
        const result = await queryClient.run(`
          DELETE FROM anime
          WHERE id NOT IN (SELECT anime_id FROM user_list)
        `);
        await queryClient.run(`
          DELETE FROM genres
          WHERE id NOT IN (SELECT genre_id FROM anime_genres)
        `);
        await queryClient.run(`
          DELETE FROM anime_relations
          WHERE anime_id NOT IN (SELECT id FROM anime)
        `);
        invalidateReadCaches();
        res.json({
          message: `Catalogo sincronizado limpiado. Se eliminaron ${result.changes} animes que no estaban en tu lista personal.`,
          deletedCount: result.changes
        });
      }
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/anime/:id/relations', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;
      const rows = await queryClient.all(`
        SELECT r.*, a.id as local_anime_id
        FROM anime_relations r
        LEFT JOIN anime a ON r.related_external_id = a.external_id AND a.source = 'AniList'
        WHERE r.anime_id = ?
          AND UPPER(COALESCE(r.relation_type, '')) IN ('PREQUEL', 'SEQUEL')
          AND UPPER(COALESCE(r.type, '')) = 'ANIME'
        ORDER BY CASE UPPER(r.relation_type) WHEN 'PREQUEL' THEN 0 ELSE 1 END, r.title
      `, [id]);
      res.json(rows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/user-list', async (req, res) => {
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
        params.push(parseInt(favorite as string, 10));
      }

      sql += ` GROUP BY ul.id `;
      sql += ` ORDER BY ul.updated_at DESC `;

      const rows = attachGenres(await queryClient.all(sql, params));
      const translatedRows = await translationService.decorateAnimeListWithSpanishTranslation(rows);
      res.json(translatedRows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/anime/external/anilist/:externalId', async (req, res) => {
    try {
      const externalId = getValidatedId(req.params.externalId, res);
      if (!externalId) return;

      const anime = await externalAnimeService.getAniListAnimeById(externalId);
      if (!anime) {
        return res.status(404).json({ error: 'No se encontro la ficha solicitada en AniList.' });
      }

      const relatedIds = (anime.relations || [])
        .map((relation: any) => Number(relation.related_external_id))
        .filter(Number.isInteger);
      const localRelations = relatedIds.length > 0
        ? await queryClient.all(
            `SELECT id, external_id
             FROM anime
             WHERE source = 'AniList'
               AND external_id IN (${relatedIds.map(() => '?').join(', ')})`,
            relatedIds
          )
        : [];
      const localIdByExternalId = new Map(
        localRelations.map((row: any) => [Number(row.external_id), Number(row.id)])
      );
      const decoratedAnime = {
        ...anime,
        relations: (anime.relations || []).map((relation: any) => ({
          ...relation,
          local_anime_id: localIdByExternalId.get(Number(relation.related_external_id)) || null
        }))
      };

      res.json(await translationService.decorateAnimeWithSpanishTranslation(decoratedAnime));
    } catch (_) {
      res.status(500).json({ error: 'No se pudo consultar la ficha vinculada.' });
    }
  });

  router.post('/user-list', async (req, res) => {
    try {
      if (!validateBodySize(res, req.body)) return;
      const validation = validateUserListInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Datos de lista invalidos.', details: validation.errors });
      }
      const { anime_id, watch_status, favorite, user_score, episodes_watched, notes } = req.body;

      await queryClient.run(`
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
        watch_status === 'watching' ? getCurrentDate().toISOString().split('T')[0] : null
      ]);

      invalidateReadCaches();
      res.status(201).json({ message: 'Anime agregado/actualizado en la lista personal' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.put('/user-list/:id', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;
      if (!validateBodySize(res, req.body)) return;

      const { watch_status, favorite, user_score, episodes_watched, notes, completed_at } = req.body;
      const validation = validateUserListInput({ anime_id: 1, watch_status, favorite, user_score, episodes_watched, notes });
      if (!validation.valid) {
        return res.status(400).json({ error: 'Datos de lista invalidos.', details: validation.errors });
      }

      const existing = await queryClient.get('SELECT id, watch_status FROM user_list WHERE id = ?', [id]);
      if (!existing) {
        return res.status(404).json({ error: 'Registro no encontrado en tu lista' });
      }

      let endDate = completed_at;
      if (watch_status === 'completed' && existing.watch_status !== 'completed' && !completed_at) {
        endDate = getCurrentDate().toISOString().split('T')[0];
      }

      await queryClient.run(`
        UPDATE user_list
        SET watch_status = ?, favorite = ?, user_score = ?, episodes_watched = ?,
            notes = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        watch_status, favorite || 0, user_score || 0, episodes_watched || 0,
        notes || '', endDate || null, id
      ]);

      invalidateReadCaches();
      res.json({ message: 'Lista personal actualizada con exito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.delete('/user-list/:id', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;
      await queryClient.run('DELETE FROM user_list WHERE id = ?', [id]);
      invalidateReadCaches();
      res.json({ message: 'Anime quitado de la lista personal' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/recommendations', async (_req, res) => {
    try {
      const cached = getCachedResponse(libraryCacheKeys.recommendations);
      if (cached) {
        res.setHeader('X-MapleVault-Cache', 'hit');
        return res.json(cached);
      }

      const recommendations = await recommendationService();
      const translatedRecommendations = await translationService.decorateAnimeListWithSpanishTranslation(
        recommendations,
        { maxRowsToTranslate: 10 }
      );
      setCachedResponse(libraryCacheKeys.recommendations, translatedRecommendations, 60_000);
      res.setHeader('X-MapleVault-Cache', 'miss');
      res.json(translatedRecommendations);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || String(q).trim() === '') {
        return res.json([]);
      }

      const externals = await externalAnimeService.searchAniList(String(q));
      const translatedExternals = await translationService.decorateAnimeListWithSpanishTranslation(externals, { maxRowsToTranslate: 10 });
      res.json(translatedExternals);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/genres', async (_req, res) => {
    try {
      const genres = await queryClient.all('SELECT name FROM genres ORDER BY name ASC');
      res.json(genres.map((genre: any) => genre.name));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/anime/import', async (req, res) => {
    try {
      if (!validateBodySize(res, req.body)) return;
      const validation = validateAnimePayload(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Datos de anime invalidos.', details: validation.errors });
      }

      const localId = await externalAnimeService.saveNormalizedAnimeToLocal(validation.data as any);
      invalidateReadCaches();
      res.json({ id: localId, message: 'Anime importado con exito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/maintenance/duplicates', async (_req, res) => {
    try {
      const groups = await queryClient.all(`
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
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
