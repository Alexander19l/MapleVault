import { Router } from 'express';
import { attachJoinedGenres } from '../anime/animeRows';
import { validateAnimePayload } from '../anime/animePayload';
import { query } from '../database/db';
import { saveNormalizedAnimeToLocal } from '../scraping/scraper';
import { validateUserListInput } from '../security/validators';
import {
  getErrorMessage as getSharedErrorMessage,
  validateBodySize
} from './routeUtils';

type QueryClient = Pick<typeof query, 'all' | 'run'>;

interface DataTransferDependencies {
  queryClient?: QueryClient;
  saveAnimeToLocal?: typeof saveNormalizedAnimeToLocal;
  invalidateLibraryReadCaches?: () => void;
}

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno al transferir datos.');
}

export function createDataTransferRouter({
  queryClient = query,
  saveAnimeToLocal = saveNormalizedAnimeToLocal,
  invalidateLibraryReadCaches = () => undefined
}: DataTransferDependencies = {}) {
  const router = Router();

  router.post('/settings/export', async (_req, res) => {
    try {
      const animes = attachJoinedGenres(await queryClient.all(`
        SELECT a.*, GROUP_CONCAT(DISTINCT g.name) as genres_joined
        FROM anime a
        LEFT JOIN anime_genres ag ON a.id = ag.anime_id
        LEFT JOIN genres g ON ag.genre_id = g.id
        GROUP BY a.id
        ORDER BY a.id ASC
      `));
      const userList = await queryClient.all('SELECT * FROM user_list');

      res.json({
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        animes,
        userList
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/settings/import', async (req, res) => {
    try {
      if (!validateBodySize(res, req.body)) return;
      const { animes, userList } = req.body;

      if (!Array.isArray(animes)) {
        return res.status(400).json({ error: 'Formato de importación inválido.' });
      }

      const importedUserList = Array.isArray(userList) ? userList : [];
      let importedAnimes = 0;
      let importedUserItems = 0;

      for (const anime of animes) {
        const validation = validateAnimePayload(anime);
        if (!validation.valid) {
          continue;
        }

        const safeAnime = validation.data;
        const animeId = await saveAnimeToLocal({
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

        const userItem = importedUserList.find((item: any) => item.anime_id === anime.id);
        if (userItem) {
          const userValidation = validateUserListInput({ ...userItem, anime_id: animeId });
          if (!userValidation.valid) continue;
          await queryClient.run(`
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
            animeId,
            userItem.watch_status,
            userItem.favorite,
            userItem.user_score,
            userItem.episodes_watched,
            userItem.notes,
            userItem.started_at,
            userItem.completed_at
          ]);
          importedUserItems++;
        }
      }

      invalidateLibraryReadCaches();
      res.json({
        message: `Importación completada. Se importaron ${importedAnimes} animes y ${importedUserItems} elementos de lista.`
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
