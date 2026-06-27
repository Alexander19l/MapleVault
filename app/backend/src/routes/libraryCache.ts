const DASHBOARD_SUMMARY_CACHE_KEY = 'dashboard:summary';
const SEASON_SUMMARY_CACHE_KEY = 'seasons:summary';
const RECOMMENDATIONS_CACHE_KEY = 'recommendations:local';
const SUMMARY_CACHE_TTL_MS = Number(process.env.MAPLEVAULT_SUMMARY_CACHE_TTL_MS || 30_000);

const responseCache = new Map<string, { expiresAt: number; value: any }>();

export function getCachedResponse<T>(key: string): T | null {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return cached.value as T;
}

export function setCachedResponse(key: string, value: any, ttlMs = SUMMARY_CACHE_TTL_MS) {
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export function invalidateLibraryReadCaches() {
  responseCache.delete(DASHBOARD_SUMMARY_CACHE_KEY);
  responseCache.delete(SEASON_SUMMARY_CACHE_KEY);
  responseCache.delete(RECOMMENDATIONS_CACHE_KEY);
}

export const libraryCacheKeys = {
  dashboardSummary: DASHBOARD_SUMMARY_CACHE_KEY,
  seasonSummary: SEASON_SUMMARY_CACHE_KEY,
  recommendations: RECOMMENDATIONS_CACHE_KEY
} as const;
