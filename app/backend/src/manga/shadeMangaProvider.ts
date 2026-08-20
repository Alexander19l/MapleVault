import axios from 'axios';
import {
  buildChapterZip,
  type MangaDexChapter,
  type MangaDexChapterPages,
  type MangaDexSearchItem
} from './mangadexProvider';
import type { MangaCatalogProvider } from './mangaProviderTypes';
import type { MangaSearchFilters } from './mangaProviderTypes';
const SHADEMANGA_SITE_URL = 'https://shademanga.com';
const SHADEMANGA_API_URL = `${SHADEMANGA_SITE_URL}/api`;
const SHADEMANGA_CDN_HOST = 'cdn.shademanga.com';
const MAX_SEARCH_LIMIT = 24;
const MAX_CHAPTER_COUNT = 2000;
const MAX_PAGE_COUNT = 500;
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const REQUEST_INTERVAL_MS = 600;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{4,32}$/;
const USER_AGENT = 'Mozilla/5.0 MapleVault/1.0';

interface ShadeMangaHttpClient {
  get<T = unknown>(url: string, config?: Record<string, unknown>): Promise<{ data: T }>;
}

interface ShadeMangaSeries {
  publicId?: unknown;
  titulo?: unknown;
  descripcion?: unknown;
  estado?: unknown;
  esMayorDeEdad?: unknown;
  portadaUrl?: unknown;
}

interface ShadeMangaChapter {
  publicId?: unknown;
  numeroCapitulo?: unknown;
  titulo?: unknown;
  fechaSubida?: unknown;
  visible?: unknown;
  grupoScan?: { nombre?: unknown } | null;
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

function getText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function getPublicId(value: unknown): string | null {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value) ? value : null;
}

function getSafeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname.toLowerCase() !== SHADEMANGA_CDN_HOST
      || parsed.username
      || parsed.password
    ) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function toSearchItem(value: ShadeMangaSeries): MangaDexSearchItem | null {
  const id = getPublicId(value.publicId);
  const title = getText(value.titulo, 240);
  if (!id || !title || value.esMayorDeEdad === true) return null;
  return {
    id,
    title,
    synopsis: getText(value.descripcion, 20_000),
    status: getText(value.estado, 80),
    contentRating: 'safe',
    coverUrl: getSafeImageUrl(value.portadaUrl) || undefined,
    sourceUrl: `${SHADEMANGA_SITE_URL}/serie/${encodeURIComponent(id)}`
  };
}

function getPageNumber(value: string): number | undefined {
  try {
    const fileName = new URL(value).pathname.split('/').pop() || '';
    const match = fileName.match(/^(\d+)(?:\.[a-z0-9]+)$/i);
    const number = match ? Number(match[1]) : NaN;
    return Number.isInteger(number) && number > 0 ? number : undefined;
  } catch {
    return undefined;
  }
}

function getImageExtension(value: string): string {
  try {
    const match = new URL(value).pathname.match(/\.([a-z0-9]{2,5})$/i);
    const extension = match?.[1]?.toLowerCase();
    return extension === 'png' || extension === 'jpg' || extension === 'jpeg' || extension === 'webp'
      ? extension
      : 'webp';
  } catch {
    return 'webp';
  }
}

export class ShadeMangaProvider implements MangaCatalogProvider {
  private readonly gate = createRequestGate();

  constructor(
    private readonly http: ShadeMangaHttpClient = axios.create({
      baseURL: SHADEMANGA_API_URL,
      timeout: 15_000,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      headers: { 'User-Agent': USER_AGENT }
    })
  ) {}

  async search(query: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaDexSearchItem[]> {
    const normalizedQuery = query.trim().slice(0, 120);
    if (!normalizedQuery) return [];
    const take = Math.min(Math.max(Math.floor(limit), 1), MAX_SEARCH_LIMIT);
    const response = await this.gate(() => this.http.get<ShadeMangaSeries[]>(
      '/series-locales/search-candidates',
      { params: { q: normalizedQuery, take, excludeAdult: true } }
    ));
    if (!Array.isArray(response.data)) return [];
    return response.data.map(toSearchItem).filter((item): item is MangaDexSearchItem => Boolean(item)).slice(0, take);
  }

  async getRecent(limit = 8): Promise<MangaDexSearchItem[]> {
    // La portada pública (`/`) es una SPA que carga las imágenes por JS
    // después de la carga inicial: el HTML servido nunca contiene <img>,
    // así que scrapearla nunca podía devolver coverUrl. El propio bundle
    // del sitio expone `series-locales/novedades-recientes`, con la misma
    // forma que search()/getDetails(), portada incluida.
    const take = Math.min(Math.max(Math.floor(limit), 1), MAX_SEARCH_LIMIT);
    const response = await this.gate(() => this.http.get<ShadeMangaSeries[]>('/series-locales/novedades-recientes'));
    if (!Array.isArray(response.data)) return [];
    return response.data.map(toSearchItem).filter((item): item is MangaDexSearchItem => Boolean(item)).slice(0, take);
  }

  async getDetails(mangaId: string): Promise<MangaDexSearchItem> {
    if (!PUBLIC_ID_PATTERN.test(mangaId)) throw new Error('Identificador de manga de ShadeManga inválido.');
    const response = await this.gate(() => this.http.get<ShadeMangaSeries>(
      `/series-locales/${encodeURIComponent(mangaId)}`
    ));
    const item = toSearchItem(response.data);
    if (!item || item.id !== mangaId) throw new Error('ShadeManga no devolvió una ficha válida.');
    return item;
  }

  async getChapters(mangaId: string): Promise<MangaDexChapter[]> {
    if (!PUBLIC_ID_PATTERN.test(mangaId)) throw new Error('Identificador de manga de ShadeManga inválido.');
    const response = await this.gate(() => this.http.get<ShadeMangaChapter[]>(
      `/series-locales/${encodeURIComponent(mangaId)}/capitulos`,
      { params: { todos: true } }
    ));
    if (!Array.isArray(response.data) || response.data.length > MAX_CHAPTER_COUNT) return [];
    const chapters: Array<MangaDexChapter | null> = response.data.map(chapter => {
      const id = getPublicId(chapter.publicId);
      const rawNumber = Number(chapter.numeroCapitulo);
      if (!id || !Number.isFinite(rawNumber) || chapter.visible === false) return null;
      return {
        id,
        number: rawNumber,
        title: getText(chapter.titulo, 240),
        language: 'es' as const,
        group: getText(chapter.grupoScan?.nombre, 120),
        publishedAt: getText(chapter.fechaSubida, 80),
        sourceUrl: `${SHADEMANGA_SITE_URL}/serie/${encodeURIComponent(mangaId)}/capitulo/${encodeURIComponent(id)}`
      } satisfies MangaDexChapter;
    });
    return chapters.filter((chapter): chapter is MangaDexChapter => chapter !== null).sort((left, right) => {
      const leftNumber = left.number ?? Number.POSITIVE_INFINITY;
      const rightNumber = right.number ?? Number.POSITIVE_INFINITY;
      return leftNumber - rightNumber || left.id.localeCompare(right.id);
    });
  }

  async getPages(chapterId: string): Promise<MangaDexChapterPages> {
    if (!PUBLIC_ID_PATTERN.test(chapterId)) throw new Error('Identificador de capítulo de ShadeManga inválido.');
    const response = await this.gate(() => this.http.get<{
      paginas?: unknown;
      publicCapituloId?: unknown;
    }>(`/series-locales/capitulo/${encodeURIComponent(chapterId)}/paginas`, {
      params: { conteo: 0 }
    }));
    if (response.data?.publicCapituloId !== chapterId || !Array.isArray(response.data.paginas)) {
      throw new Error('ShadeManga no devolvió páginas para el capítulo solicitado.');
    }
    const pages = response.data.paginas.map((page, index) => {
      const url = getSafeImageUrl(page);
      return url ? { url, number: getPageNumber(url), index } : null;
    }).filter((page): page is { url: string; number: number | undefined; index: number } => Boolean(page));
    if (pages.length === 0 || pages.length > MAX_PAGE_COUNT) {
      throw new Error('ShadeManga devolvió una cantidad de páginas no válida.');
    }
    pages.sort((left, right) => {
      if (left.number !== undefined && right.number !== undefined) return left.number - right.number;
      return left.index - right.index;
    });
    const uniquePages = [...new Set(pages.map(page => page.url))];
    if (uniquePages.length !== pages.length) throw new Error('ShadeManga devolvió páginas duplicadas.');
    return { chapterId, quality: 'data-saver', pages: uniquePages };
  }

  async downloadPages(pages: string[]): Promise<Buffer> {
    if (pages.length === 0 || pages.length > MAX_PAGE_COUNT) {
      throw new Error('El capítulo contiene una cantidad de páginas no válida.');
    }
    const files: Array<{ name: string; data: Buffer }> = [];
    let totalBytes = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const safeUrl = getSafeImageUrl(pages[index]);
      if (!safeUrl) throw new Error('La página no pertenece a la CDN permitida de ShadeManga.');
      const response = await this.gate(() => this.http.get<ArrayBuffer>(safeUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': USER_AGENT, Referer: SHADEMANGA_SITE_URL }
      }));
      const data = Buffer.from(response.data);
      totalBytes += data.length;
      if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error('El capítulo supera el tamaño máximo permitido.');
      files.push({
        name: `${String(index + 1).padStart(3, '0')}.${getImageExtension(safeUrl)}`,
        data
      });
    }
    return buildChapterZip(files);
  }
}

export const shadeMangaProviderConfig = {
  id: 'shademanga',
  label: 'ShadeManga',
  language: 'es',
  baseUrl: SHADEMANGA_API_URL
} as const;
