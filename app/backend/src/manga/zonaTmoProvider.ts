import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import {
  buildChapterZip,
  sanitizeDownloadName,
  type MangaDexChapter,
  type MangaDexChapterPages,
  type MangaDexSearchItem
} from './mangadexProvider';
import type { MangaCatalogProvider } from './mangaProviderTypes';
import type { MangaSearchFilters } from './mangaProviderTypes';

const ZONATMO_BASE_URL = 'https://zonatmo.org';
const ZONATMO_IMAGE_HOST_SUFFIX = '.zonatmo.org';
const MAX_SEARCH_LIMIT = 24;
const MAX_CHAPTER_COUNT = 2000;
const MAX_PAGE_COUNT = 500;
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const REQUEST_INTERVAL_MS = 900;
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_LIMIT = 16;
const USER_AGENT = 'Mozilla/5.0 MapleVault/1.0';

interface ZonaTmoHttpClient {
  get<T = unknown>(url: string, config?: Record<string, unknown>): Promise<{
    data: T;
    request?: { res?: { responseUrl?: string } };
  }>;
}

function createRequestGate() {
  let nextAvailableAt = 0;
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const wait = Math.max(0, nextAvailableAt - Date.now());
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    nextAvailableAt = Date.now() + REQUEST_INTERVAL_MS;
    return operation();
  };
}

function encodeSourcePath(path: string): string {
  return Buffer.from(path, 'utf8').toString('base64url');
}

function decodeSourcePath(value: string): string | null {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (!decoded.startsWith('/library/')) return null;
    return decoded;
  } catch {
    return null;
  }
}

function getAllowedUrl(value: unknown, allowedHosts: string[]): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  try {
    const parsed = new URL(value, ZONATMO_BASE_URL);
    const hostname = parsed.hostname.toLowerCase();
    const allowed = allowedHosts.some(host => hostname === host || hostname.endsWith(host));
    if (parsed.protocol !== 'https:' || !allowed || parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function getPageNumber(value: string): number | undefined {
  const match = value.match(/(?:p[aá]gina\s*)?(\d+)(?:\.[a-z]+)?$/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function getChapterNumber(value: string): number | undefined {
  const match = value.match(/cap[ií]tulo\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

function getAbsolutePath(value: unknown, prefix: string): string | null {
  const safeUrl = getAllowedUrl(value, ['zonatmo.org']);
  if (!safeUrl) return null;
  const parsed = new URL(safeUrl);
  if (!parsed.pathname.startsWith(prefix)) return null;
  return `${parsed.pathname}${parsed.search}`;
}

export class ZonaTmoProvider implements MangaCatalogProvider {
  private readonly gate = createRequestGate();
  private readonly detailCache = new Map<string, { html: string; expiresAt: number }>();

  constructor(
    private readonly http: ZonaTmoHttpClient = axios.create({
      timeout: 15_000,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      headers: { 'User-Agent': USER_AGENT }
    })
  ) {}

  private async getDetailHtml(mangaId: string): Promise<{ html: string; path: string }> {
    const path = decodeSourcePath(mangaId);
    if (!path) throw new Error('Identificador de manga de ZonaTMO inválido.');
    const cached = this.detailCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return { html: cached.html, path };
    this.detailCache.delete(path);

    const detailUrl = `${ZONATMO_BASE_URL}${path}`;
    const response = await this.gate(() => this.http.get<string>(detailUrl, {
      headers: { 'User-Agent': USER_AGENT, Referer: ZONATMO_BASE_URL }
    }));
    const html = String(response.data);
    if (this.detailCache.size >= DETAIL_CACHE_LIMIT) {
      const oldestKey = this.detailCache.keys().next().value;
      if (oldestKey) this.detailCache.delete(oldestKey);
    }
    this.detailCache.set(path, { html, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
    return { html, path };
  }

  async search(query: string, limit = 20, filters: MangaSearchFilters = {}): Promise<MangaDexSearchItem[]> {
    const normalizedQuery = query.trim().slice(0, 120);
    if (!normalizedQuery) return [];
    const response = await this.gate(() => this.http.get<string>(`${ZONATMO_BASE_URL}/biblioteca`, {
      params: { title: normalizedQuery, _pg: Math.max(1, Math.floor(filters.page || 0) + 1) },
      headers: { 'User-Agent': USER_AGENT }
    }));
    const doc = cheerio.load(String(response.data));
    const result: MangaDexSearchItem[] = [];
    doc('.element a[href*="/library/"]').each((_, element) => {
      if (result.length >= Math.min(Math.max(Math.floor(limit), 1), MAX_SEARCH_LIMIT)) return;
      const href = getAllowedUrl(doc(element).attr('href'), ['zonatmo.org']);
      const path = getAbsolutePath(href, '/library/');
      const title = doc(element).find('.thumbnail-title h4').first().text().replace(/\s+/g, ' ').trim();
      if (!path || !title) return;
      const cover = getAllowedUrl(doc(element).find('img').first().attr('src'), ['zonatmo.org']);
      result.push({
        id: encodeSourcePath(path),
        title,
        synopsis: undefined,
        coverUrl: cover || undefined,
        sourceUrl: `${ZONATMO_BASE_URL}${path}`
      });
    });
    return result;
  }

  async getRecent(limit = 8): Promise<MangaDexSearchItem[]> {
    const response = await this.gate(() => this.http.get<string>(`${ZONATMO_BASE_URL}/biblioteca`, {
      params: { _pg: 1 },
      headers: { 'User-Agent': USER_AGENT }
    }));
    const doc = cheerio.load(String(response.data));
    const result: MangaDexSearchItem[] = [];
    doc('.element a[href*="/library/"]').each((_, element) => {
      if (result.length >= Math.min(Math.max(Math.floor(limit), 1), MAX_SEARCH_LIMIT)) return;
      const href = getAllowedUrl(doc(element).attr('href'), ['zonatmo.org']);
      const path = getAbsolutePath(href, '/library/');
      const title = doc(element).find('.thumbnail-title h4').first().text().replace(/\s+/g, ' ').trim();
      if (!path || !title) return;
      result.push({ id: encodeSourcePath(path), title, coverUrl: getAllowedUrl(doc(element).find('img').first().attr('src'), ['zonatmo.org']) || undefined, sourceUrl: `${ZONATMO_BASE_URL}${path}` });
    });
    return result;
  }

  async getDetails(mangaId: string): Promise<MangaDexSearchItem> {
    const { html, path } = await this.getDetailHtml(mangaId);
    const doc = cheerio.load(html);
    const title = doc('h1.element-title, h1:not(.book-type)').first().text().replace(/\s+/g, ' ').trim();
    const synopsis = doc('#manga-synopsis').first().text().replace(/\s+/g, ' ').trim();
    const cover = getAllowedUrl(doc('meta[property="og:image"]').attr('content'), ['zonatmo.org']);
    if (!title) throw new Error('ZonaTMO no devolvió una ficha válida.');
    return {
      id: mangaId,
      title,
      synopsis: synopsis || undefined,
      coverUrl: cover || undefined,
      sourceUrl: `${ZONATMO_BASE_URL}${path}`
    };
  }

  async getChapters(mangaId: string): Promise<MangaDexChapter[]> {
    const { html, path } = await this.getDetailHtml(mangaId);
    const detailUrl = `${ZONATMO_BASE_URL}${path}`;
    const doc = cheerio.load(html);
    const chapters: MangaDexChapter[] = [];
    doc('li.upload-link').each((_, element) => {
      if (chapters.length >= MAX_CHAPTER_COUNT) return;
      const item = doc(element);
      const readerUrl = getAllowedUrl(item.find('a[href*="/view_uploads/"]').attr('href'), ['zonatmo.org']);
      const sourceUrl = getAllowedUrl(detailUrl, ['zonatmo.org']);
      const text = item.text().replace(/\s+/g, ' ').trim();
      if (!readerUrl || !sourceUrl) return;
      const chapterId = new URL(readerUrl).pathname.split('/').filter(Boolean).pop();
      if (!chapterId || !/^\d+$/.test(chapterId)) return;
      chapters.push({
        id: chapterId,
        number: getChapterNumber(text),
        language: 'es',
        publishedAt: item.find('.text-muted').last().text().replace(/\s+/g, ' ').trim() || undefined,
        sourceUrl
      });
    });
    return chapters.sort((left, right) => {
      const leftNumber = left.number ?? Number.POSITIVE_INFINITY;
      const rightNumber = right.number ?? Number.POSITIVE_INFINITY;
      return leftNumber - rightNumber || left.id.localeCompare(right.id);
    });
  }

  async getPages(chapterId: string): Promise<MangaDexChapterPages> {
    if (!/^\d+$/.test(chapterId)) throw new Error('Identificador de capítulo de ZonaTMO inválido.');
    const readerUrl = `${ZONATMO_BASE_URL}/view_uploads/${chapterId}`;
    const response = await this.gate(() => this.http.get<string>(readerUrl, {
      headers: { 'User-Agent': USER_AGENT, Referer: ZONATMO_BASE_URL }
    }));
    const doc = cheerio.load(String(response.data));
    const pages = doc('img[alt^="Página"]').map((_, element) => {
      const url = getAllowedUrl(doc(element).attr('src'), [ZONATMO_IMAGE_HOST_SUFFIX]);
      if (!url) return null;
      return { url, number: getPageNumber(doc(element).attr('alt') || url) };
    }).get()
      .filter((item): item is { url: string; number: number | undefined } => Boolean(item))
      .sort((left, right) => (left.number ?? Number.POSITIVE_INFINITY) - (right.number ?? Number.POSITIVE_INFINITY));
    if (pages.length === 0 || pages.length > MAX_PAGE_COUNT) {
      throw new Error('ZonaTMO no devolvió páginas válidas para el capítulo.');
    }
    return { chapterId, quality: 'data-saver', pages: pages.map(page => page.url) };
  }

  async downloadPages(pages: string[]): Promise<Buffer> {
    if (pages.length === 0 || pages.length > MAX_PAGE_COUNT) {
      throw new Error('El capítulo contiene una cantidad de páginas no válida.');
    }
    const files: Array<{ name: string; data: Buffer }> = [];
    let totalBytes = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const safeUrl = getAllowedUrl(pages[index], [ZONATMO_IMAGE_HOST_SUFFIX]);
      if (!safeUrl) throw new Error('La página no pertenece a una CDN permitida de ZonaTMO.');
      const response = await this.gate(() => this.http.get<ArrayBuffer>(safeUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': USER_AGENT, Referer: ZONATMO_BASE_URL }
      }));
      const data = Buffer.from(response.data);
      totalBytes += data.length;
      if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error('El capítulo supera el tamaño máximo permitido.');
      files.push({ name: `${String(index + 1).padStart(3, '0')}.webp`, data });
    }
    return buildChapterZip(files.map(file => ({
      name: sanitizeDownloadName(file.name, `${String(files.indexOf(file) + 1).padStart(3, '0')}.webp`),
      data: file.data
    })));
  }
}

export const zonaTmoProviderConfig = {
  id: 'zonatmo',
  label: 'ZonaTMO',
  language: 'es',
  baseUrl: ZONATMO_BASE_URL
} as const;
