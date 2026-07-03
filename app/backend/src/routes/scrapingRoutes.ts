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
  getScrapingSourceRateLimit,
  getScrapingSources,
  updateScrapingSource
} from './scrapingRepository';
import {
  MASSIVE_SYNC_MIN_DELAY_MS,
  runMassiveYearSync,
  SCRAPING_SEASONS,
  syncSeasonAndPersist
} from './scrapingSyncService';
import {
  sharedScrapingJobTracker,
  type ScrapingJobTracker
} from './scrapingJobTracker';

type QueryClient = Pick<typeof query, 'get' | 'all' | 'run'>;

interface ScrapingRouterDependencies {
  queryClient?: QueryClient;
  syncSeason?: typeof syncSeasonFromAniList;
  saveAnimeToLocal?: typeof saveNormalizedAnimeToLocal;
  writeScrapingLog?: typeof logScraping;
  invalidateLibraryReadCaches?: () => void;
  getCurrentYear?: () => number;
  jobTracker?: ScrapingJobTracker;
  sleep?: (ms: number) => Promise<void>;
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
  getCurrentYear = () => new Date().getFullYear(),
  jobTracker = sharedScrapingJobTracker,
  sleep
}: ScrapingRouterDependencies = {}) {
  const router = Router();

  router.post('/scraping/sync-season', async (req, res) => {
    try {
      const { year, season } = req.body;
      if (!year || !season) {
        return res.status(400).json({ error: 'year y season son requeridos' });
      }

      const parsedYear = parseInt(year, 10);
      const normalizedSeason = String(season).toLowerCase();
      if (
        Number.isNaN(parsedYear)
        || parsedYear < 1970
        || parsedYear > getCurrentYear() + 1
        || !SCRAPING_SEASONS.includes(normalizedSeason as typeof SCRAPING_SEASONS[number])
      ) {
        return res.status(400).json({ error: 'Año o temporada no válidos.' });
      }
      if (jobTracker.isRunning()) {
        return res.status(409).json({
          error: 'Ya hay una sincronización en curso.',
          job: jobTracker.getStatus()
        });
      }

      const configuredDelay = await getScrapingSourceRateLimit(
        queryClient,
        'AniList API',
        MASSIVE_SYNC_MIN_DELAY_MS
      );
      const requestDelayMs = Math.max(MASSIVE_SYNC_MIN_DELAY_MS, configuredDelay);
      jobTracker.startSeason(parsedYear, normalizedSeason, requestDelayMs);
      jobTracker.apply({ type: 'season_started', year: parsedYear, season: normalizedSeason });

      const savedCount = await syncSeasonAndPersist({
        year: parsedYear,
        season: normalizedSeason,
        syncSeason,
        saveAnimeToLocal,
        syncOptions: {
          requestDelayMs,
          maxRetries: 3,
          sleep,
          onRetry: retry => jobTracker.apply({
            type: 'retrying',
            year: parsedYear,
            season: normalizedSeason,
            attempt: retry.attempt,
            delayMs: retry.delayMs,
            message: retry.message
          })
        }
      });

      invalidateLibraryReadCaches();
      jobTracker.apply({
        type: 'season_completed',
        year: parsedYear,
        season: normalizedSeason,
        imported: savedCount
      });
      jobTracker.complete(savedCount);
      res.json({
        message: `Sincronización completada. Se añadieron o actualizaron ${savedCount} animes.`,
        count: savedCount,
        job: jobTracker.getStatus()
      });
    } catch (error: unknown) {
      if (jobTracker.isRunning()) jobTracker.fail(error);
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
      if (jobTracker.isRunning()) {
        return res.status(409).json({
          error: 'Ya hay una sincronización en curso.',
          job: jobTracker.getStatus()
        });
      }

      const configuredDelay = await getScrapingSourceRateLimit(
        queryClient,
        'AniList API',
        MASSIVE_SYNC_MIN_DELAY_MS
      );
      const requestDelayMs = Math.max(MASSIVE_SYNC_MIN_DELAY_MS, configuredDelay);
      const job = jobTracker.startMassive(parsedStart, currentYear, requestDelayMs);

      void runMassiveYearSync({
        startYear: parsedStart,
        currentYear,
        syncSeason,
        saveAnimeToLocal,
        writeScrapingLog,
        invalidateLibraryReadCaches,
        requestDelayMs,
        sleep,
        onProgress: event => jobTracker.apply(event)
      })
        .then(totalImported => jobTracker.complete(totalImported))
        .catch(async error => {
          jobTracker.fail(error);
          try {
            await writeScrapingLog(
              'Massive Scraping',
              'Sincronización masiva interrumpida',
              'error',
              `Fallo general: ${getErrorMessage(error)}`
            );
          } catch {
            // El estado en memoria conserva el error aunque SQLite no pueda registrar el log.
          }
        });

      res.json({
        message: `Scraping masivo iniciado desde ${parsedStart} hasta ${currentYear} con un intervalo mínimo de ${requestDelayMs} ms.`,
        job
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/scraping/status', (_req, res) => {
    res.json(jobTracker.getStatus());
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
