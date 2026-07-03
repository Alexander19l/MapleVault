export interface ScrapingQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }>;
}

export async function getScrapingSourceRateLimit(
  queryClient: ScrapingQueryClient,
  sourceName: string,
  fallbackMs: number
): Promise<number> {
  const row = await queryClient.get(
    'SELECT rate_limit FROM sources WHERE name = ? AND enabled = 1',
    [sourceName]
  );
  const rateLimit = Number(row?.rate_limit);
  return Number.isInteger(rateLimit) && rateLimit > 0 ? rateLimit : fallbackMs;
}

export function getScrapingLogs(queryClient: ScrapingQueryClient): Promise<any[]> {
  return queryClient.all('SELECT * FROM scraping_logs ORDER BY id DESC LIMIT 50');
}

export function getScrapingSources(queryClient: ScrapingQueryClient): Promise<any[]> {
  return queryClient.all('SELECT * FROM sources');
}

export function updateScrapingSource(
  queryClient: ScrapingQueryClient,
  sourceId: number,
  enabled: unknown,
  rateLimit: number
): Promise<{ lastID: number; changes: number }> {
  return queryClient.run(`
    UPDATE sources
    SET enabled = ?, rate_limit = ?, last_sync = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [enabled ? 1 : 0, rateLimit, sourceId]);
}
