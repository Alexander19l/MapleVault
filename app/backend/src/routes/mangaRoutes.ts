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
import {
  MangaDexProvider,
  mangaDexProviderConfig,
  sanitizeDownloadName
} from '../manga/mangadexProvider';
import {
  getMangaProvider,
  getMangaProviderDescriptors,
  isMangaProviderEnabled
} from '../manga/mangaProviders';
import type { MangaCatalogProvider } from '../manga/mangaProviderTypes';
import { ZonaTmoProvider } from '../manga/zonaTmoProvider';
import { ShadeMangaProvider } from '../manga/shadeMangaProvider';

type QueryClient = Pick<typeof query, 'get' | 'all'>;

interface MangaRouterDependencies {
  queryClient?: QueryClient;
  sourceCandidatesProvider?: typeof getMediaSourceCandidates;
  mangaDexProvider?: MangaDexProvider;
  zonaTmoProvider?: MangaCatalogProvider;
  shadeMangaProvider?: MangaCatalogProvider;
}

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno en manga.');
}

function requireMangaProvider(
  rawProvider: unknown,
  res: { status: (code: number) => { json: (body: unknown) => unknown } }
) {
  const providerId = typeof rawProvider === 'string' ? rawProvider : undefined;
  const provider = getMangaProvider(providerId);
  if (!provider) {
    res.status(400).json({ error: 'Proveedor de manga inválido.', code: 'MANGA_PROVIDER_INVALID' });
    return null;
  }
  if (!isMangaProviderEnabled(provider.id)) {
    res.status(409).json({
      error: `${provider.label} está deshabilitado y no puede consultarse.`,
      code: 'MANGA_PROVIDER_DISABLED',
      provider
    });
    return null;
  }
  return provider;
}

function getProviderImplementation(
  providerId: string,
  mangaDexProvider: MangaCatalogProvider,
  zonaTmoProvider: MangaCatalogProvider,
  shadeMangaProvider: MangaCatalogProvider
): MangaCatalogProvider | null {
  if (providerId === 'mangadex') return mangaDexProvider;
  if (providerId === 'zonatmo') return zonaTmoProvider;
  if (providerId === 'shademanga') return shadeMangaProvider;
  return null;
}

function getProviderResponse(provider: ReturnType<typeof getMangaProvider>) {
  if (!provider) return mangaDexProviderConfig;
  return {
    id: provider.id,
    label: provider.label,
    language: provider.languages.join('/'),
    baseUrl: provider.baseUrl
  };
}

function isValidMangaId(providerId: string, value: string): boolean {
  if (providerId === 'mangadex') return /^[0-9a-f-]{36}$/i.test(value);
  if (providerId === 'zonatmo') return /^[A-Za-z0-9_-]{16,512}$/.test(value);
  if (providerId === 'shademanga') return /^[A-Za-z0-9]{4,32}$/.test(value);
  return false;
}

function isValidChapterId(providerId: string, value: string): boolean {
  if (providerId === 'mangadex') return /^[0-9a-f-]{36}$/i.test(value);
  if (providerId === 'zonatmo') return /^\d{1,12}$/.test(value);
  if (providerId === 'shademanga') return /^[A-Za-z0-9]{4,32}$/.test(value);
  return false;
}

export function createMangaRouter({
  queryClient = query,
  sourceCandidatesProvider = getMediaSourceCandidates,
  mangaDexProvider = new MangaDexProvider(),
  zonaTmoProvider = new ZonaTmoProvider(),
  shadeMangaProvider = new ShadeMangaProvider()
}: MangaRouterDependencies = {}) {
  const router = Router();

  router.get('/manga/online/providers', (_req, res) => {
    res.json({ providers: getMangaProviderDescriptors(), defaultProvider: 'mangadex' });
  });

  router.get('/manga/online/search', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(provider.id, mangaDexProvider, zonaTmoProvider, shadeMangaProvider);
    if (!implementation) {
      return res.status(503).json({
        error: `${provider.label} todavía no tiene un adaptador operativo en MapleVault.`,
        code: 'MANGA_PROVIDER_ADAPTER_UNAVAILABLE'
      });
    }
    const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (searchQuery.length < 2) {
      return res.status(400).json({ error: 'Escribe al menos dos caracteres para buscar manga.' });
    }

    try {
      const results = await implementation.search(searchQuery, Number(req.query.limit) || 20);
      return res.json({ provider: getProviderResponse(provider), results });
    } catch (error: unknown) {
      console.warn(`[MapleVault] ${provider.label} no respondió a la búsqueda.`, error);
      return res.status(502).json({
        error: `${provider.label} no está disponible en este momento. Intenta nuevamente más tarde.`,
        code: 'MANGA_PROVIDER_UNAVAILABLE'
      });
    }
  });

  router.get('/manga/online/:mangaId/details', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(
      provider.id,
      mangaDexProvider,
      zonaTmoProvider,
      shadeMangaProvider
    );
    if (!implementation) {
      return res.status(503).json({
        error: `${provider.label} todavía no tiene un adaptador operativo en MapleVault.`,
        code: 'MANGA_PROVIDER_ADAPTER_UNAVAILABLE'
      });
    }
    const mangaId = req.params.mangaId;
    if (!isValidMangaId(provider.id, mangaId)) {
      return res.status(400).json({ error: 'Identificador de manga inválido.' });
    }

    try {
      const manga = await implementation.getDetails(mangaId);
      return res.json({ provider: getProviderResponse(provider), manga });
    } catch (error: unknown) {
      console.warn(`[MapleVault] ${provider.label} no devolvió la ficha del manga.`, error);
      return res.status(502).json({
        error: `No se pudo cargar la ficha desde ${provider.label}.`,
        code: 'MANGA_PROVIDER_DETAILS_UNAVAILABLE'
      });
    }
  });

  router.get('/manga/online/:mangaId/chapters', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(provider.id, mangaDexProvider, zonaTmoProvider, shadeMangaProvider);
    if (!implementation) {
      return res.status(503).json({ error: `${provider.label} todavía no tiene un adaptador operativo en MapleVault.`, code: 'MANGA_PROVIDER_ADAPTER_UNAVAILABLE' });
    }
    const mangaId = req.params.mangaId;
    if (!isValidMangaId(provider.id, mangaId)) {
      return res.status(400).json({ error: 'Identificador de manga inválido.' });
    }

    try {
      const rawLanguages = typeof req.query.languages === 'string'
        ? req.query.languages.split(',')
        : ['es', 'en'];
      const languages = rawLanguages.filter(
        (language): language is 'es' | 'en' => language === 'es' || language === 'en'
      );
      const chapters = await implementation.getChapters(mangaId, languages.length ? languages : ['es', 'en']);
      return res.json({ provider: getProviderResponse(provider), mangaId, chapters });
    } catch (error: unknown) {
      console.warn(`[MapleVault] ${provider.label} no devolvió capítulos.`, error);
      return res.status(502).json({
        error: `No se pudieron cargar los capítulos desde ${provider.label}.`,
        code: 'MANGA_PROVIDER_CHAPTERS_UNAVAILABLE'
      });
    }
  });

  router.get('/manga/online/chapters/:chapterId/pages', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(provider.id, mangaDexProvider, zonaTmoProvider, shadeMangaProvider);
    if (!implementation) {
      return res.status(503).json({ error: `${provider.label} todavía no tiene un adaptador operativo en MapleVault.`, code: 'MANGA_PROVIDER_ADAPTER_UNAVAILABLE' });
    }
    const chapterId = req.params.chapterId;
    if (!isValidChapterId(provider.id, chapterId)) {
      return res.status(400).json({ error: 'Identificador de capítulo inválido.' });
    }
    const quality = req.query.quality === 'data' ? 'data' : 'data-saver';

    try {
      const pages = await implementation.getPages(chapterId, quality);
      return res.json({ provider: getProviderResponse(provider), ...pages });
    } catch (error: unknown) {
      console.warn(`[MapleVault] ${provider.label} no devolvió páginas.`, error);
      return res.status(502).json({
        error: `No se pudieron cargar las páginas del capítulo desde ${provider.label}.`,
        code: 'MANGA_PROVIDER_PAGES_UNAVAILABLE'
      });
    }
  });

  router.get('/manga/online/chapters/:chapterId/download', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(provider.id, mangaDexProvider, zonaTmoProvider, shadeMangaProvider);
    if (!implementation) {
      return res.status(503).json({ error: `${provider.label} todavía no tiene un adaptador operativo en MapleVault.`, code: 'MANGA_PROVIDER_ADAPTER_UNAVAILABLE' });
    }
    const chapterId = req.params.chapterId;
    if (!isValidChapterId(provider.id, chapterId)) {
      return res.status(400).json({ error: 'Identificador de capítulo inválido.' });
    }
    const quality = req.query.quality === 'data' ? 'data' : 'data-saver';
    const seriesTitle = sanitizeDownloadName(
      typeof req.query.series === 'string' ? req.query.series : '',
      'Manga'
    );
    const chapterLabel = sanitizeDownloadName(
      typeof req.query.chapter === 'string' ? req.query.chapter : '',
      chapterId.slice(0, 8)
    );

    try {
      const pages = await implementation.getPages(chapterId, quality);
      const archive = await implementation.downloadPages(pages.pages, quality);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', archive.length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${seriesTitle} - Capitulo ${chapterLabel}.zip"`
      );
      return res.send(archive);
    } catch (error: unknown) {
      console.warn(`[MapleVault] No se pudo empaquetar el capítulo de ${provider.label}.`, error);
      return res.status(502).json({
        error: 'No se pudo preparar la descarga del capítulo.',
        code: 'MANGA_PROVIDER_DOWNLOAD_UNAVAILABLE'
      });
    }
  });

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
        policy: 'MangaDex, ZonaTMO y ShadeManga cuentan con adaptadores operativos y aislados por proveedor.',
        providers: getMangaProviderDescriptors(),
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
