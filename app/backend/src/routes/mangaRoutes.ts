import { Router } from 'express';
import { query } from '../database/db';
import { getMediaSourceCandidates } from '../sources/mediaSourceCandidates';
import {
  getMangaById,
  getMangaRows,
  getMangaSourceRows
} from './mangaRepository';
import {
  getErrorMessage as getSharedErrorMessage,
  getValidatedId
} from './routeUtils';

type QueryClient = Pick<typeof query, 'get' | 'all'>;

interface MangaRouterDependencies {
  queryClient?: QueryClient;
  sourceCandidatesProvider?: typeof getMediaSourceCandidates;
}

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno en manga.');
}

export function createMangaRouter({
  queryClient = query,
  sourceCandidatesProvider = getMediaSourceCandidates
}: MangaRouterDependencies = {}) {
  const router = Router();

  router.get('/manga', async (req, res) => {
    try {
      const result = await getMangaRows(queryClient, {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        format: typeof req.query.format === 'string' ? req.query.format : undefined,
        sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
        limit: Number(req.query.limit),
        offset: Number(req.query.offset),
        withTotal: req.query.withTotal === 'true'
      });

      if (req.query.withTotal === 'true') {
        return res.json(result);
      }

      res.json(result.rows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/manga/sources', async (_req, res) => {
    try {
      const configured = await getMangaSourceRows(queryClient);
      const candidates = sourceCandidatesProvider()
        .filter(source => source.content === 'manga' || source.content === 'anime-manga')
        .map(source => ({
          id: source.id,
          name: source.name,
          url: source.url,
          languages: source.languages,
          use: source.use,
          risk: source.risk,
          enabledByDefault: source.enabledByDefault,
          notes: source.notes
        }));

      res.json({
        policy: 'Las fuentes de manga están preparadas, pero ninguna fuente de scraping se activa sin revisión manual.',
        configured,
        candidates
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/manga/:id', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;

      const manga = await getMangaById(queryClient, id);
      if (!manga) {
        return res.status(404).json({ error: 'Manga no encontrado.' });
      }

      res.json(manga);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
