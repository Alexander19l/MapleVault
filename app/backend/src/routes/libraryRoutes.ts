import { Router } from 'express';
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
import {
  getCatalogAnimeRows
} from './libraryCatalogRepository';
import {
  getAnimeRelations,
  getAnimeWithUserStateAndGenres,
  getDuplicateAnimeGroups,
  getGenreNames,
  getLocalAnimeRowsByExternalIds,
  getUserListRows
} from './libraryReadRepository';
import {
  getDashboardSummaryData,
  getSeasonsSummaryData
} from './librarySummaryRepository';
import {
  clearCatalogData,
  createAnimeWithGenres,
  deleteAnimeById,
  deleteUserListEntry,
  getUserListEntryForUpdate,
  updateAnimeWithGenres,
  updateUserListEntry,
  upsertUserListEntry
} from './libraryWriteRepository';
import {
  getErrorMessage as getSharedErrorMessage,
  getValidatedId,
  validateBodySize
} from './routeUtils';

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
  return getSharedErrorMessage(error, 'Error interno en biblioteca.');
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
      const { translateSynopsis, withTotal } = filters;
      const adult = req.query.adult === 'only' ? 'only' : req.query.adult === 'include' ? 'include' : undefined;
      const catalogResult = await getCatalogAnimeRows(queryClient, filters, adult);
      const rows = attachGenres(catalogResult.rows);
      const translatedRows = await translationService.decorateAnimeListWithSpanishTranslation(rows, {
        maxRowsToTranslate: translateSynopsis ? Math.min(rows.length, 24) : 0
      });

      if (withTotal) {
        return res.json({
          items: translatedRows,
          total: catalogResult.total || 0,
          limit: catalogResult.limit,
          offset: catalogResult.offset
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

      const summary = await getDashboardSummaryData(queryClient);
      const [recentAdded, airingList] = await Promise.all([
        translationService.decorateAnimeListWithSpanishTranslation(attachGenres(summary.recentRows), { maxRowsToTranslate: 0 }),
        translationService.decorateAnimeListWithSpanishTranslation(attachGenres(summary.airingRows), { maxRowsToTranslate: 0 })
      ]);

      const payload = {
        stats: summary.stats,
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

      const payload = await getSeasonsSummaryData(queryClient);
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

      const anime = await getAnimeWithUserStateAndGenres(queryClient, id);

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

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

      const newId = await createAnimeWithGenres(queryClient, validation.data);
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

      const updated = await updateAnimeWithGenres(queryClient, id, validation.data);
      if (!updated) {
        return res.status(404).json({ error: 'Anime no encontrado' });
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
      await deleteAnimeById(queryClient, id);
      invalidateReadCaches();
      res.json({ message: 'Anime eliminado del catalogo local' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/anime/clear', async (req, res) => {
    try {
      const { keepUserList } = req.body;
      const result = await clearCatalogData(queryClient, keepUserList);

      if (result.clearedAll) {
        invalidateReadCaches();
        res.json({ message: 'Se ha eliminado por completo todo el catalogo y tus listas personales.' });
      } else {
        invalidateReadCaches();
        res.json({
          message: `Catalogo sincronizado limpiado. Se eliminaron ${result.deletedCount} animes que no estaban en tu lista personal.`,
          deletedCount: result.deletedCount
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
      const rows = await getAnimeRelations(queryClient, id);
      res.json(rows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/user-list', async (req, res) => {
    try {
      const { status, favorite } = req.query;
      const rows = attachGenres(await getUserListRows(queryClient, { status, favorite }));
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
      const localRelations = await getLocalAnimeRowsByExternalIds(queryClient, relatedIds);
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

      await upsertUserListEntry(queryClient, {
        anime_id,
        watch_status,
        favorite,
        user_score,
        episodes_watched,
        notes
      }, watch_status === 'watching' ? getCurrentDate().toISOString().split('T')[0] : null);

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

      const existing = await getUserListEntryForUpdate(queryClient, id);
      if (!existing) {
        return res.status(404).json({ error: 'Registro no encontrado en tu lista' });
      }

      let endDate = completed_at;
      if (watch_status === 'completed' && existing.watch_status !== 'completed' && !completed_at) {
        endDate = getCurrentDate().toISOString().split('T')[0];
      }

      await updateUserListEntry(queryClient, id, {
        watch_status,
        favorite,
        user_score,
        episodes_watched,
        notes
      }, endDate || null);

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
      await deleteUserListEntry(queryClient, id);
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
      res.json(await getGenreNames(queryClient));
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
      res.json(await getDuplicateAnimeGroups(queryClient));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
