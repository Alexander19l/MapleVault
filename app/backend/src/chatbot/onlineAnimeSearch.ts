import {
  searchAniList,
  searchAniListPage,
  searchJikan,
  searchJikanPage
} from '../scraping/scraper';
import { decorateAnimeListWithSpanishTranslation } from '../translation/translationService';
import { decorateResult, mergeAnimeResults } from './animeResultUtils';

export type OnlineSearchProvider = 'anilist' | 'jikan';

export interface OnlineSearchPage {
  items: any[];
  provider: OnlineSearchProvider;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  available: boolean;
}

const ONLINE_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ONLINE_SEARCH_CACHE_ENTRIES = 64;
const onlineSearchCache = new Map<string, { createdAt: number; value: OnlineSearchPage }>();

function getCacheKey(queryText: string, page: number, pageSize: number, provider?: OnlineSearchProvider) {
  return `${provider || 'auto'}:${queryText.trim().toLowerCase()}:${page}:${pageSize}`;
}

function readCachedPage(key: string): OnlineSearchPage | null {
  const cached = onlineSearchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > ONLINE_SEARCH_CACHE_TTL_MS) {
    onlineSearchCache.delete(key);
    return null;
  }
  return cached.value;
}

function cachePage(key: string, value: OnlineSearchPage): OnlineSearchPage {
  if (onlineSearchCache.size >= MAX_ONLINE_SEARCH_CACHE_ENTRIES) {
    const oldestKey = onlineSearchCache.keys().next().value;
    if (oldestKey) onlineSearchCache.delete(oldestKey);
  }
  onlineSearchCache.set(key, { createdAt: Date.now(), value });
  return value;
}

async function loadProviderPage(
  queryText: string,
  page: number,
  pageSize: number,
  provider: OnlineSearchProvider
): Promise<OnlineSearchPage> {
  const providerPage = provider === 'anilist'
    ? await searchAniListPage(queryText, { page, perPage: pageSize })
    : await searchJikanPage(queryText, { page, perPage: pageSize });
  const decorated = providerPage.items.map(item => decorateResult(item, 'online'));
  const items = await decorateAnimeListWithSpanishTranslation(decorated, {
    maxRowsToTranslate: pageSize
  });

  return {
    items,
    provider,
    page: providerPage.page,
    pageSize: providerPage.pageSize,
    total: providerPage.total,
    totalPages: providerPage.totalPages,
    hasMore: providerPage.hasNextPage,
    available: providerPage.available
  };
}

export async function searchOnlinePage(
  queryText: string,
  page = 1,
  pageSize = 6,
  provider?: OnlineSearchProvider
): Promise<OnlineSearchPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(12, Math.max(1, Math.floor(pageSize)));
  const cacheKey = getCacheKey(queryText, safePage, safePageSize, provider);
  const cached = readCachedPage(cacheKey);
  if (cached) return cached;

  if (provider) {
    return cachePage(
      cacheKey,
      await loadProviderPage(queryText, safePage, safePageSize, provider)
    );
  }

  const aniListPage = await loadProviderPage(queryText, safePage, safePageSize, 'anilist');
  if (aniListPage.items.length > 0) {
    return cachePage(cacheKey, aniListPage);
  }

  const jikanPage = await loadProviderPage(queryText, safePage, safePageSize, 'jikan');
  return cachePage(cacheKey, jikanPage);
}

export function clearOnlineSearchCache(): void {
  onlineSearchCache.clear();
}

export async function searchOnlineSources(queryText: string): Promise<any[]> {
  const aniListResults = await searchAniList(queryText);
  if (aniListResults.length > 0) {
    const jikanResults = await searchJikan(queryText);
    const merged = mergeAnimeResults(
      aniListResults.map(item => decorateResult(item, 'online')),
      jikanResults.map(item => decorateResult(item, 'online'))
    ).slice(0, 10);
    return decorateAnimeListWithSpanishTranslation(merged, { maxRowsToTranslate: 10 });
  }

  const jikanResults = await searchJikan(queryText);
  const results = jikanResults.map(item => decorateResult(item, 'online')).slice(0, 10);
  return decorateAnimeListWithSpanishTranslation(results, { maxRowsToTranslate: 10 });
}
