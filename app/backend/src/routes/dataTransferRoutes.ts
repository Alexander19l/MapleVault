import { Router } from 'express';
import { query } from '../database/db';
import { saveNormalizedAnimeToLocal } from '../scraping/scraper';
import {
  getErrorMessage as getSharedErrorMessage,
  validateBodySize
} from './routeUtils';
import {
  exportUserData,
  importUserData
} from './dataTransferService';

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
      res.json(await exportUserData(queryClient));
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

      const importResult = await importUserData(
        { animes, userList },
        queryClient,
        saveAnimeToLocal
      );

      invalidateLibraryReadCaches();
      res.json({
        message: `Importación completada. Se importaron ${importResult.importedAnimes} animes y ${importResult.importedUserItems} elementos de lista.`
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
