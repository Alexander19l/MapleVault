import { Router } from 'express';
import axios from 'axios';
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
import { createMangaPageProxyPath, verifyMangaPageProxy } from '../manga/mangaPageProxy';
import { translateTextForAnime } from '../translation/translationService';
import type { MangaSearchFilters } from '../manga/mangaProviderTypes';

type QueryClient = Pick<typeof query, 'get' | 'all' | 'run'>;

interface MangaRouterDependencies {
  queryClient?: QueryClient;
  sourceCandidatesProvider?: typeof getMediaSourceCandidates;
  mangaDexProvider?: MangaDexProvider;
  zonaTmoProvider?: MangaCatalogProvider;
  shadeMangaProvider?: MangaCatalogProvider;
  translationProvider?: typeof translateTextForAnime;
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

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function isValidExternalMangaId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{4,512}$/.test(value);
}

export function createMangaRouter({
  queryClient = query,
  sourceCandidatesProvider = getMediaSourceCandidates,
  mangaDexProvider = new MangaDexProvider(),
  zonaTmoProvider = new ZonaTmoProvider(),
  shadeMangaProvider = new ShadeMangaProvider(),
  translationProvider = translateTextForAnime
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
    try {
      const filters: MangaSearchFilters = {
        genres: typeof req.query.genres === 'string' ? req.query.genres.split(',').filter(Boolean).slice(0, 4) : undefined,
        tags: typeof req.query.tags === 'string' ? req.query.tags.split(',').filter(Boolean).slice(0, 4) : undefined,
        status: typeof req.query.status === 'string' ? req.query.status.slice(0, 32) : undefined,
        page: Math.min(Math.max(Number(req.query.page) || 0, 0), 100)
      };
      const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 160) : '';
      const hasFilters = Boolean(filters.genres?.length || filters.tags?.length || filters.status || filters.page);
      if (searchQuery.length < 2 && !filters.genres?.length && !filters.tags?.length && !filters.status) {
        return res.status(400).json({ error: 'Escribe un título o selecciona al menos un género o tema.' });
      }
      const results = hasFilters
        ? await implementation.search(searchQuery, Number(req.query.limit) || 20, filters)
        : await implementation.search(searchQuery, Number(req.query.limit) || 20);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 24);
      return res.json({ provider: getProviderResponse(provider), results, page: filters.page || 0, hasMore: results.length >= limit });
    } catch (error: unknown) {
      console.warn(`[MapleVault] ${provider.label} no respondió a la búsqueda.`, error);
      return res.status(502).json({
        error: `${provider.label} no está disponible en este momento. Intenta nuevamente más tarde.`,
        code: 'MANGA_PROVIDER_UNAVAILABLE'
      });
    }
  });

  router.get('/manga/online/recent', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(provider.id, mangaDexProvider, zonaTmoProvider, shadeMangaProvider);
    if (!implementation?.getRecent) return res.json({ provider: getProviderResponse(provider), results: [], supported: false });
    try {
      const results = await implementation.getRecent(Number(req.query.limit) || 8);
      return res.json({ provider: getProviderResponse(provider), results, supported: true });
    } catch (error) {
      console.warn(`[MapleVault] No se pudieron cargar recientes de ${provider.label}.`, error);
      return res.json({ provider: getProviderResponse(provider), results: [], supported: false });
    }
  });

  router.get('/manga/online/tags', async (req, res) => {
    const provider = requireMangaProvider(req.query.source, res);
    if (!provider) return;
    const implementation = getProviderImplementation(provider.id, mangaDexProvider, zonaTmoProvider, shadeMangaProvider);
    if (!implementation?.getTags) return res.json({ provider: getProviderResponse(provider), tags: [], supported: false });
    try {
      const tags = await implementation.getTags();
      return res.json({ provider: getProviderResponse(provider), tags, supported: true });
    } catch (error) {
      console.warn(`[MapleVault] No se pudieron cargar tags de ${provider.label}.`, error);
      return res.json({ provider: getProviderResponse(provider), tags: [], supported: false });
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
      const originalSynopsis = manga.synopsis || '';
      const translation = await translationProvider({
        animeId: null,
        entityKey: `manga:${provider.id}:${manga.id}`,
        field: 'synopsis',
        text: originalSynopsis
      });
      return res.json({
        provider: getProviderResponse(provider),
        manga: {
          ...manga,
          synopsis_original: originalSynopsis || undefined,
          synopsis: translation.text || originalSynopsis || undefined,
          translation: { translated: translation.translated, cached: translation.cached, status: translation.status }
        }
      });
    } catch (error: unknown) {
      console.warn(`[MapleVault] ${provider.label} no devolvió la ficha del manga.`, error);
      return res.status(502).json({
        error: `No se pudo cargar la ficha desde ${provider.label}.`,
        code: 'MANGA_PROVIDER_DETAILS_UNAVAILABLE'
      });
    }
  });

  router.get('/manga/online/page-proxy', async (req, res) => {
    const providerId = typeof req.query.provider === 'string' ? req.query.provider : '';
    const encodedUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const expires = typeof req.query.exp === 'string' ? req.query.exp : '';
    const signature = typeof req.query.sig === 'string' ? req.query.sig : '';
    if (!getMangaProvider(providerId) || !encodedUrl || !expires || !signature) return res.status(400).end();
    const safeUrl = verifyMangaPageProxy(providerId, encodedUrl, expires, signature);
    if (!safeUrl) return res.status(403).end();
    try {
      const upstream = await axios.get<ArrayBuffer>(safeUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxContentLength: 20 * 1024 * 1024,
        headers: { Referer: getProviderResponse(getMangaProvider(providerId)).baseUrl, 'User-Agent': 'MapleVault/1.0' }
      });
      const contentType = String(upstream.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (!contentType.startsWith('image/')) return res.status(502).end();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.send(Buffer.from(upstream.data));
    } catch {
      return res.status(502).end();
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
      const proxyBase = `${req.protocol}://${req.get('host')}`;
      const proxiedPages = pages.pages
        .map(page => createMangaPageProxyPath(provider.id, page))
        .filter((page): page is string => Boolean(page))
        .map(page => new URL(page, proxyBase).toString());
      if (!proxiedPages.length) throw new Error('No se pudieron proteger las páginas del capítulo.');
      return res.json({ provider: getProviderResponse(provider), ...pages, pages: proxiedPages });
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

  router.post('/manga/library', async (req, res) => {
    const source = boundedText(req.body?.source, 32);
    const externalId = req.body?.externalId;
    const title = boundedText(req.body?.title, 240);
    if (!source || !isValidExternalMangaId(externalId) || !title) {
      return res.status(400).json({ error: 'La ficha de manga local no es válida.' });
    }

    try {
      const existing = await queryClient.get(
        'SELECT id FROM manga WHERE source = ? AND CAST(external_id AS TEXT) = ? LIMIT 1',
        [source, externalId]
      );
      let mangaId = Number(existing?.id) || 0;
      const values = [
        externalId,
        source,
        title,
        boundedText(req.body?.titleRomaji, 240) || null,
        boundedText(req.body?.titleEnglish, 240) || null,
        boundedText(req.body?.synopsis, 20_000) || null,
        Number.isInteger(Number(req.body?.year)) ? Number(req.body.year) : null,
        boundedText(req.body?.status, 40) || 'unknown',
        boundedText(req.body?.coverUrl, 4096) || null,
        boundedText(req.body?.sourceUrl, 4096) || null,
        Array.isArray(req.body?.chapters) ? req.body.chapters.length : 0
      ];
      if (mangaId) {
        await queryClient.run(`UPDATE manga SET title = ?, title_romaji = ?, title_english = ?, synopsis = ?, year = ?, status = ?, cover_image = ?, official_url = ?, chapters = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], mangaId]);
      } else {
        const result = await queryClient.run(`INSERT INTO manga (external_id, source, title, title_romaji, title_english, synopsis, year, status, format, cover_image, official_url, chapters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manga', ?, ?, ?)`, values);
        mangaId = result.lastID;
        await queryClient.run('INSERT OR IGNORE INTO manga_user_list (manga_id, read_status) VALUES (?, ?)', [mangaId, 'plan_to_read']);
      }

      const genres = Array.isArray(req.body?.genres) ? req.body.genres.filter((genre: unknown): genre is string => typeof genre === 'string').map((genre: string) => genre.trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [];
      await queryClient.run('DELETE FROM manga_genres WHERE manga_id = ?', [mangaId]);
      for (const genre of genres) {
        await queryClient.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genre]);
        const genreRow = await queryClient.get('SELECT id FROM genres WHERE name = ? LIMIT 1', [genre]);
        if (genreRow?.id) await queryClient.run('INSERT OR IGNORE INTO manga_genres (manga_id, genre_id) VALUES (?, ?)', [mangaId, genreRow.id]);
      }

      const chapters = Array.isArray(req.body?.chapters) ? req.body.chapters.slice(0, 2000) : [];
      await queryClient.run('DELETE FROM manga_chapters WHERE manga_id = ? AND source = ?', [mangaId, source]);
      for (const chapter of chapters) {
        if (!isValidExternalMangaId(chapter?.id)) continue;
        await queryClient.run(`INSERT OR IGNORE INTO manga_chapters (manga_id, source, source_chapter_id, chapter_number, title, url, language, scanlator, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          mangaId,
          source,
          chapter.id,
          Number.isFinite(Number(chapter.number)) ? Number(chapter.number) : null,
          boundedText(chapter.title, 240) || null,
          boundedText(chapter.sourceUrl, 4096) || null,
          chapter.language === 'en' ? 'en' : 'es',
          boundedText(chapter.group, 120) || null,
          boundedText(chapter.publishedAt, 80) || null
        ]);
      }
      return res.status(201).json({ saved: true, mangaId });
    } catch (error: unknown) {
      console.warn('[MapleVault] No se pudo guardar el manga local.', error);
      return res.status(500).json({ error: getErrorMessage(error) });
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

  router.get('/manga/:id/chapters', async (req, res) => {
    try {
      const id = getValidatedId(req.params.id, res);
      if (!id) return;
      const rows = await queryClient.all(`SELECT id, source, source_chapter_id, chapter_number, title, url, language, scanlator, published_at FROM manga_chapters WHERE manga_id = ? ORDER BY chapter_number IS NULL, chapter_number ASC, language ASC, id ASC`, [id]);
      return res.json({ chapters: rows.map(row => ({ id: String(row.source_chapter_id || row.id), number: row.chapter_number === null ? undefined : Number(row.chapter_number), title: row.title || undefined, language: row.language === 'en' ? 'en' : 'es', group: row.scanlator || undefined, publishedAt: row.published_at || undefined, sourceUrl: row.url || '' })) });
    } catch (error: unknown) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
