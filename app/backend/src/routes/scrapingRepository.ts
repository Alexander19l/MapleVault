export interface ScrapingQueryClient {
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }>;
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
