import { Router } from 'express';
import { query } from '../database/db';
import {
  logScraping,
  saveNormalizedAnimeToLocal,
  syncSeasonFromAniList
} from '../scraping/scraper';
import { validateId } from '../security/validators';
import { getErrorMessage as getSharedErrorMessage } from './routeUtils';
import {
  getScrapingLogs,
  getScrapingSources,
  updateScrapingSource
} from './scrapingRepository';
import {
  runMassiveYearSync,
  syncSeasonAndPersist
} from './scrapingSyncService';

type QueryClient = Pick<typeof query, 'all' | 'run'>;

interface ScrapingRouterDependencies {
  queryClient?: QueryClient;
  syncSeason?: typeof syncSeasonFromAniList;
  saveAnimeToLocal?: typeof saveNormalizedAnimeToLocal;
  writeScrapingLog?: typeof logScraping;
  invalidateLibraryReadCaches?: () => void;
  getCurrentYear?: () => number;
}

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno en scraping.');
}

export function createScrapingRouter({
  queryClient = query,
  syncSeason = syncSeasonFromAniList,
  saveAnimeToLocal = saveNormalizedAnimeToLocal,
  writeScrapingLog = logScraping,
  invalidateLibraryReadCaches = () => undefined,
  getCurrentYear = () => new Date().getFullYear()
}: ScrapingRouterDependencies = {}) {
  const router = Router();

  router.post('/scraping/sync-season', async (req, res) => {
    try {
      const { year, season } = req.body;
      if (!year || !season) {
        return res.status(400).json({ error: 'year y season son requeridos' });
      }

      const savedCount = await syncSeasonAndPersist({
        year: parseInt(year, 10),
        season,
        syncSeason,
        saveAnimeToLocal
      });

      invalidateLibraryReadCaches();
      res.json({
        message: `Sincronización completada. Se añadieron o actualizaron ${savedCount} animes.`,
        count: savedCount
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/scraping/sync-years', async (req, res) => {
    try {
      const { startYear } = req.body;
      if (!startYear) {
        return res.status(400).json({ error: 'El año de inicio (startYear) es requerido.' });
      }

      const parsedStart = parseInt(startYear, 10);
      const currentYear = getCurrentYear();
      if (Number.isNaN(parsedStart) || parsedStart < 1970 || parsedStart > currentYear) {
        return res.status(400).json({ error: 'Año de inicio no válido.' });
      }

      void runMassiveYearSync({
        startYear: parsedStart,
        currentYear,
        syncSeason,
        saveAnimeToLocal,
        writeScrapingLog,
        invalidateLibraryReadCaches
      });

      res.json({
        message: `Scraping masivo iniciado en segundo plano desde el año ${parsedStart} hasta ${currentYear}. Puedes ver el progreso en los logs de scraping.`
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/scraping/logs', async (_req, res) => {
    try {
      res.json(await getScrapingLogs(queryClient));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/scraping/sources', async (_req, res) => {
    try {
      res.json(await getScrapingSources(queryClient));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.put('/scraping/sources/:id', async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      const { enabled, rate_limit } = req.body;
      const safeRateLimit = Number(rate_limit);
      if (!Number.isInteger(safeRateLimit) || safeRateLimit < 250 || safeRateLimit > 60000) {
        return res.status(400).json({ error: 'rate_limit debe ser un entero entre 250 y 60000 ms.' });
      }

      await updateScrapingSource(queryClient, id, enabled, safeRateLimit);
      res.json({ message: 'Fuente actualizada con éxito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
