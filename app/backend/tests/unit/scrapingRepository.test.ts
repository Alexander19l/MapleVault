import { describe, expect, it, vi } from 'vitest';
import {
  getScrapingLogs,
  getScrapingSources,
  updateScrapingSource
} from '../../src/routes/scrapingRepository';

describe('Scraping repository', () => {
  it('lee logs y fuentes con consultas existentes', async () => {
    const queryClient = {
      all: vi.fn()
        .mockResolvedValueOnce([{ id: 1, status: 'success' }])
        .mockResolvedValueOnce([{ id: 2, name: 'AniList' }]),
      run: vi.fn()
    };

    await expect(getScrapingLogs(queryClient)).resolves.toEqual([{ id: 1, status: 'success' }]);
    await expect(getScrapingSources(queryClient)).resolves.toEqual([{ id: 2, name: 'AniList' }]);
    expect(queryClient.all.mock.calls[0][0]).toBe('SELECT * FROM scraping_logs ORDER BY id DESC LIMIT 50');
    expect(queryClient.all.mock.calls[1][0]).toBe('SELECT * FROM sources');
  });

  it('actualiza fuente normalizando enabled y rate limit', async () => {
    const queryClient = {
      all: vi.fn(),
      run: vi.fn().mockResolvedValue({ lastID: 0, changes: 1 })
    };

    await updateScrapingSource(queryClient, 5, false, 1200);

    expect(queryClient.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE sources'), [0, 1200, 5]);
  });
});
