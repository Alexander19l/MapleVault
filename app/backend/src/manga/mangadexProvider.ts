import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { MangaSearchFilters, MangaTagOption } from './mangaProviderTypes';

const MANGADEX_BASE_URL = 'https://api.mangadex.org';
const MANGADEX_UPLOADS_HOST = 'uploads.mangadex.org';
const MANGADEX_AT_HOME_HOST_SUFFIX = '.mangadex.network';
const MAX_SEARCH_LIMIT = 24;
const MAX_CHAPTER_LIMIT = 100;
const MAX_TOTAL_CHAPTERS = 2000;
const MAX_PAGE_COUNT = 500;
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const REQUEST_INTERVAL_MS = 250;

export interface MangaDexSearchItem {
  id: string;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  synopsis?: string;
  status?: string;
  year?: number;
  contentRating?: string;
  coverUrl?: string;
  sourceUrl: string;
  genres?: string[];
  tags?: string[];
}

export interface MangaDexChapter {
  id: string;
  number?: number;
  volume?: string;
  title?: string;
  language: 'es' | 'en';
  group?: string;
  publishedAt?: string;
  sourceUrl: string;
}

export interface MangaDexChapterPages {
  chapterId: string;
  quality: 'data' | 'data-saver';
  pages: string[];
}

interface MangaDexHttpClient {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

interface MangaDexEntity {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  relationships?: Array<{ type?: string; attributes?: Record<string, any> }>;
}

interface MangaDexResponse<T> {
  result?: string;
  data?: T[];
  total?: number;
  limit?: number;
  offset?: number;
}

interface MangaDexSingleResponse<T> {
  result?: string;
  data?: T;
}

function getLocalizedValue(value: unknown, preferred: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const language of preferred) {
    const candidate = record[language];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  const fallback = Object.values(record).find(item => typeof item === 'string' && item.trim());
  return typeof fallback === 'string' ? fallback.trim() : undefined;
}

function getCoverFileName(entity: MangaDexEntity): string | undefined {
  const relation = entity.relationships?.find(item => item.type === 'cover_art');
  const fileName = relation?.attributes?.fileName;
  return typeof fileName === 'string' && fileName.length <= 255 ? fileName : undefined;
}

function getMangaCoverUrl(entity: MangaDexEntity): string | undefined {
  const fileName = getCoverFileName(entity);
  if (!fileName) return undefined;
  return `https://${MANGADEX_UPLOADS_HOST}/covers/${encodeURIComponent(entity.id)}/${encodeURIComponent(fileName)}.256.jpg`;
}

function toSearchItem(entity: MangaDexEntity): MangaDexSearchItem | null {
  if (!entity.id || entity.type !== 'manga') return null;
  const attributes = entity.attributes || {};
  const title = getLocalizedValue(attributes.title, ['es', 'en', 'ja-ro', 'ja']) || 'Título no disponible';
  const altTitles = Array.isArray(attributes.altTitles) ? attributes.altTitles : [];
  const englishTitle = altTitles
    .map((item: unknown) => getLocalizedValue(item, ['en']))
    .find((item: string | undefined): item is string => Boolean(item));
  const romajiTitle = altTitles
    .map((item: unknown) => getLocalizedValue(item, ['ja-ro', 'ja-latn']))
    .find((item: string | undefined): item is string => Boolean(item));
  const year = Number(attributes.year);
  const tags = Array.isArray(attributes.tags) ? attributes.tags
    .map((tag: any) => getLocalizedValue(tag?.attributes?.name, ['es', 'en']))
    .filter((tag: string | undefined): tag is string => Boolean(tag)) : [];

  return {
    id: entity.id,
    title,
    titleEnglish: englishTitle,
    titleRomaji: romajiTitle,
    synopsis: getLocalizedValue(attributes.description, ['es', 'en', 'ja-ro', 'ja']),
    status: typeof attributes.status === 'string' ? attributes.status : undefined,
    year: Number.isInteger(year) ? year : undefined,
    contentRating: typeof attributes.contentRating === 'string' ? attributes.contentRating : undefined,
    coverUrl: getMangaCoverUrl(entity),
    sourceUrl: `https://mangadex.org/title/${encodeURIComponent(entity.id)}`,
    tags
  };
}

function toChapter(entity: MangaDexEntity): MangaDexChapter | null {
  if (!entity.id || entity.type !== 'chapter') return null;
  const attributes = entity.attributes || {};
  const language = attributes.translatedLanguage;
  if (language !== 'es' && language !== 'en') return null;
  const rawNumber = attributes.chapter === null || attributes.chapter === undefined
    ? undefined
    : Number(attributes.chapter);
  const number = rawNumber !== undefined && Number.isFinite(rawNumber) ? rawNumber : undefined;
  const group = entity.relationships?.find(item => item.type === 'scanlation_group')?.attributes?.name;

  return {
    id: entity.id,
    number,
    volume: typeof attributes.volume === 'string' ? attributes.volume : undefined,
    title: typeof attributes.title === 'string' ? attributes.title : undefined,
    language,
    group: typeof group === 'string' ? group : undefined,
    publishedAt: typeof attributes.publishAt === 'string' ? attributes.publishAt : undefined,
    sourceUrl: `https://mangadex.org/chapter/${encodeURIComponent(entity.id)}`
  };
}

function getSafeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = hostname === MANGADEX_UPLOADS_HOST
      || hostname.endsWith(MANGADEX_AT_HOME_HOST_SUFFIX);
    if (parsed.protocol !== 'https:' || !isAllowed || parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeChapterPages(
  response: any,
  quality: 'data' | 'data-saver'
): string[] {
  const baseUrl = typeof response?.baseUrl === 'string' ? response.baseUrl : '';
  const chapterHash = typeof response?.chapter?.hash === 'string' ? response.chapter.hash : '';
  const responseField = quality === 'data' ? 'data' : 'dataSaver';
  const files = Array.isArray(response?.chapter?.[responseField])
    ? response.chapter[responseField]
    : [];
  if (!baseUrl || !chapterHash || files.length > MAX_PAGE_COUNT) return [];

  return files.map((file: unknown) => {
    if (typeof file !== 'string' || file.length > 512) return null;
    return getSafeImageUrl(`${baseUrl}/${quality}/${chapterHash}/${encodeURIComponent(file)}`);
  }).filter((url: string | null): url is string => Boolean(url));
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

export function sanitizeDownloadName(value: string, fallback: string): string {
  const cleaned = String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || fallback).slice(0, 120);
}

export function buildChapterZip(
  files: Array<{ name: string; data: Buffer }>
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    name.copy(localHeader, 30);
    localParts.push(localHeader, file.data);

    const centralHeader = Buffer.alloc(46 + name.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    name.copy(centralHeader, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class MangaDexProvider {
  private readonly gate = createRequestGate();

  constructor(
    private readonly http: MangaDexHttpClient = axios.create({
      baseURL: MANGADEX_BASE_URL,
      timeout: 12_000,
      maxContentLength: MAX_DOWNLOAD_BYTES
    })
  ) {}

  async search(query: string, limit = 20, filters: MangaSearchFilters = {}): Promise<MangaDexSearchItem[]> {
    const normalizedQuery = query.trim().slice(0, 160);
    if (!normalizedQuery && !filters.recent) return [];
    const params: Record<string, unknown> = {
      limit: Math.min(Math.max(Math.floor(limit), 1), MAX_SEARCH_LIMIT),
      offset: Math.min(Math.max(Math.floor(filters.page || 0), 0), 100) * Math.min(Math.max(Math.floor(limit), 1), MAX_SEARCH_LIMIT),
      'contentRating[]': ['safe', 'suggestive'],
      'includes[]': ['cover_art']
    };
    if (normalizedQuery) params.title = normalizedQuery;
    if (filters.recent) params['order[latestUploadedChapter]'] = 'desc';
    const includedTags = [...(filters.genres || []), ...(filters.tags || [])].filter(Boolean).slice(0, 8);
    if (includedTags.length) {
      params['includedTags[]'] = includedTags;
      params.includedTagsMode = 'AND';
    }
    if (filters.status) params['status[]'] = [filters.status];
    const response = await this.gate(() => this.http.get<MangaDexResponse<MangaDexEntity>>('/manga', {
      params
    }));
    if (response.data?.result !== 'ok' || !Array.isArray(response.data.data)) return [];
    return response.data.data.map(toSearchItem).filter((item): item is MangaDexSearchItem => Boolean(item));
  }

  async getRecent(limit = 8): Promise<MangaDexSearchItem[]> {
    return this.search('', limit, { recent: true });
  }

  async getTags(): Promise<MangaTagOption[]> {
    const response = await this.gate(() => this.http.get<MangaDexResponse<MangaDexEntity>>('/manga/tag', { params: { limit: 100 } }));
    if (!Array.isArray(response.data?.data)) return [];
    return response.data.data.map(tag => {
      const name = getLocalizedValue(tag.attributes?.name, ['es', 'en']);
      if (!name) return null;
      const rawGroup = tag.attributes?.group;
      const group = rawGroup === 'genre' || rawGroup === 'theme' || rawGroup === 'format' ? rawGroup : 'other';
      return { id: tag.id, name, group } satisfies MangaTagOption;
    }).filter((tag): tag is MangaTagOption => Boolean(tag));
  }

  async getDetails(mangaId: string): Promise<MangaDexSearchItem> {
    if (!/^[0-9a-f-]{36}$/i.test(mangaId)) throw new Error('Identificador de manga inválido.');
    const response = await this.gate(() => this.http.get<MangaDexSingleResponse<MangaDexEntity>>(
      `/manga/${encodeURIComponent(mangaId)}`,
      { params: { 'includes[]': ['cover_art'] } }
    ));
    const item = response.data?.result === 'ok' && response.data.data
      ? toSearchItem(response.data.data)
      : null;
    if (!item) throw new Error('MangaDex no devolvió una ficha válida.');
    return item;
  }

  async getChapters(mangaId: string, languages: Array<'es' | 'en'> = ['es', 'en']): Promise<MangaDexChapter[]> {
    if (!/^[0-9a-f-]{36}$/i.test(mangaId)) throw new Error('Identificador de manga inválido.');
    const chapters: MangaDexEntity[] = [];
    const uniqueIds = new Set<string>();
    const translatedLanguages = [...new Set(languages)];

    for (let offset = 0; offset < MAX_TOTAL_CHAPTERS; offset += MAX_CHAPTER_LIMIT) {
      const response = await this.gate(() => this.http.get<MangaDexResponse<MangaDexEntity>>('/chapter', {
        params: {
          manga: mangaId,
          'translatedLanguage[]': translatedLanguages,
          'contentRating[]': ['safe', 'suggestive'],
          'includes[]': ['scanlation_group'],
          'order[chapter]': 'asc',
          limit: MAX_CHAPTER_LIMIT,
          offset
        }
      }));
      const page = response.data?.result === 'ok' && Array.isArray(response.data.data) ? response.data.data : [];
      for (const entity of page) {
        if (entity.id && !uniqueIds.has(entity.id)) {
          uniqueIds.add(entity.id);
          chapters.push(entity);
        }
      }
      if (page.length < MAX_CHAPTER_LIMIT) break;
    }

    return chapters
      .map(toChapter)
      .filter((chapter): chapter is MangaDexChapter => Boolean(chapter))
      .sort((left, right) => {
        const leftNumber = left.number ?? Number.POSITIVE_INFINITY;
        const rightNumber = right.number ?? Number.POSITIVE_INFINITY;
        if (leftNumber !== rightNumber) return leftNumber - rightNumber;
        if (left.language !== right.language) return left.language === 'es' ? -1 : 1;
        const leftDate = left.publishedAt || '';
        const rightDate = right.publishedAt || '';
        return leftDate.localeCompare(rightDate) || left.id.localeCompare(right.id);
      });
  }

  async getPages(
    chapterId: string,
    quality: 'data' | 'data-saver' = 'data-saver'
  ): Promise<MangaDexChapterPages> {
    if (!/^[0-9a-f-]{36}$/i.test(chapterId)) throw new Error('Identificador de capítulo inválido.');
    const response = await this.gate(() => this.http.get(`/at-home/server/${encodeURIComponent(chapterId)}`));
    const pages = normalizeChapterPages(response.data, quality);
    if (pages.length === 0) throw new Error('El capítulo no tiene páginas disponibles.');
    return { chapterId, quality, pages };
  }

  async downloadPages(
    pages: string[],
    quality: 'data' | 'data-saver' = 'data-saver'
  ): Promise<Buffer> {
    if (pages.length === 0 || pages.length > MAX_PAGE_COUNT) {
      throw new Error('El capítulo contiene una cantidad de páginas no válida.');
    }
    const files: Array<{ name: string; data: Buffer }> = [];
    let totalBytes = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const safeUrl = getSafeImageUrl(pages[index]);
      if (!safeUrl) throw new Error('La página del capítulo no pertenece a MangaDex.');
      const response = await this.gate(() => this.http.get<ArrayBuffer>(safeUrl, {
        responseType: 'arraybuffer',
        maxContentLength: MAX_DOWNLOAD_BYTES
      }));
      const data = Buffer.from(response.data);
      totalBytes += data.length;
      if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error('El capítulo supera el tamaño máximo permitido.');
      files.push({
        name: `${String(index + 1).padStart(3, '0')}.${quality === 'data' ? 'jpg' : 'jpg'}`,
        data
      });
    }
    return buildChapterZip(files);
  }
}

export const mangaDexProviderConfig = {
  id: 'mangadex',
  label: 'MangaDex API',
  language: 'es/en',
  baseUrl: MANGADEX_BASE_URL
} as const;
