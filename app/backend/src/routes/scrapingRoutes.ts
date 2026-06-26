import { Router } from 'express';
import { query } from '../database/db';
import {
  logScraping,
  saveNormalizedAnimeToLocal,
  syncSeasonFromAniList
} from '../scraping/scraper';
import { validateId } from '../security/validators';
import { getErrorMessage as getSharedErrorMessage } from './routeUtils';

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

      const list = await syncSeason(parseInt(year, 10), season);
      let savedCount = 0;

      for (const anime of list) {
        await saveAnimeToLocal(anime);
        savedCount++;
      }

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

      (async () => {
        await writeScrapingLog(
          'Massive Scraping',
          `Sincronización masiva desde ${parsedStart}`,
          'started',
          `Iniciando importación desde el año ${parsedStart} hasta ${currentYear}`
        );

        const seasons = ['winter', 'spring', 'summer', 'fall'];
        let totalImported = 0;

        for (let year = parsedStart; year <= currentYear; year++) {
          for (const season of seasons) {
            try {
              console.log(`[Massive Scraping] Sincronizando ${year} ${season}...`);
              const list = await syncSeason(year, season);
              let saved = 0;
              for (const anime of list) {
                await saveAnimeToLocal(anime);
                saved++;
              }
              if (saved > 0) invalidateLibraryReadCaches();
              totalImported += saved;
              await writeScrapingLog(
                'Massive Scraping',
                `Sincronización masiva: ${year} ${season}`,
                'success',
                `Sincronizados ${saved} animes.`
              );
            } catch (error: unknown) {
              const message = getErrorMessage(error);
              console.error(`Error en scraping masivo para ${year} ${season}:`, message);
              await writeScrapingLog(
                'Massive Scraping',
                `Sincronización masiva: ${year} ${season}`,
                'error',
                `Fallo: ${message}`
              );
            }
          }
        }

        invalidateLibraryReadCaches();
        await writeScrapingLog(
          'Massive Scraping',
          'Sincronización masiva terminada',
          'success',
          `Sincronización masiva completada. Total de animes importados/actualizados: ${totalImported}`
        );
      })();

      res.json({
        message: `Scraping masivo iniciado en segundo plano desde el año ${parsedStart} hasta ${currentYear}. Puedes ver el progreso en los logs de scraping.`
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/scraping/logs', async (_req, res) => {
    try {
      const logs = await queryClient.all('SELECT * FROM scraping_logs ORDER BY id DESC LIMIT 50');
      res.json(logs);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/scraping/sources', async (_req, res) => {
    try {
      const sources = await queryClient.all('SELECT * FROM sources');
      res.json(sources);
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

      await queryClient.run(`
        UPDATE sources
        SET enabled = ?, rate_limit = ?, last_sync = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [enabled ? 1 : 0, safeRateLimit, id]);
      res.json({ message: 'Fuente actualizada con éxito' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
