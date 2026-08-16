import { describe, expect, it, vi } from 'vitest';
import {
  SCRAPING_SEASONS,
  runMassiveYearSync,
  syncSeasonAndPersist
} from '../../src/routes/scrapingSyncService';
import type { NormalizedAnime } from '../../src/scraping/scraper';

const animeFixture: NormalizedAnime = {
  external_id: 100,
  source: 'AniList',
  title: 'Maple Season',
  year: 2026,
  season: 'winter',
  genres: ['Action']
};

describe('Scraping sync service', () => {
  it('sincroniza una temporada y persiste cada anime', async () => {
    const syncSeason = vi.fn().mockResolvedValue([animeFixture, { ...animeFixture, external_id: 101 }]);
    const saveAnimeToLocal = vi.fn().mockResolvedValue(1);

    const count = await syncSeasonAndPersist({
      year: 2026,
      season: 'winter',
      syncSeason,
      saveAnimeToLocal
    });

    expect(count).toBe(2);
    expect(syncSeason).toHaveBeenCalledWith(2026, 'winter');
    expect(saveAnimeToLocal).toHaveBeenCalledTimes(2);
  });

  it('ejecuta scraping masivo por temporadas, registra logs y continua ante fallos', async () => {
    const syncSeason = vi.fn(async (_year: number, season: string) => {
      if (season === 'spring') throw new Error('fuente caida');
      return [animeFixture];
    });
    const saveAnimeToLocal = vi.fn().mockResolvedValue(1);
    const writeScrapingLog = vi.fn().mockResolvedValue(undefined);
    const invalidateLibraryReadCaches = vi.fn();
    const logger = {
      log: vi.fn(),
      error: vi.fn()
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    const total = await runMassiveYearSync({
      startYear: 2026,
      currentYear: 2026,
      syncSeason,
      saveAnimeToLocal,
      writeScrapingLog,
      invalidateLibraryReadCaches,
      logger,
      sleep
    });

    expect(total).toBe(3);
    expect(syncSeason).toHaveBeenCalledTimes(SCRAPING_SEASONS.length);
    expect(writeScrapingLog).toHaveBeenCalledWith(
      'Massive Scraping',
      'Sincronización masiva desde 2026',
      'started',
      expect.any(String)
    );
    expect(writeScrapingLog).toHaveBeenCalledWith(
      'Massive Scraping',
      'Sincronización masiva: 2026 spring',
      'error',
      expect.stringContaining('Fallo definitivo: fuente caida')
    );
    expect(writeScrapingLog).toHaveBeenCalledWith(
      'Massive Scraping',
      'Sincronización masiva terminada',
      'error',
      expect.stringContaining('Total de animes importados/actualizados: 3')
    );
    expect(invalidateLibraryReadCaches).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1500);
    expect(logger.error).toHaveBeenCalledWith('Error en scraping masivo para 2026 spring:', 'fuente caida');
  });

  it('espera y reintenta una temporada cuando la fuente responde 429', async () => {
    const rateLimitError: any = new Error('Too many requests');
    rateLimitError.response = { status: 429 };
    const syncSeason = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue([animeFixture]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    const total = await runMassiveYearSync({
      startYear: 2026,
      currentYear: 2026,
      syncSeason,
      saveAnimeToLocal: vi.fn().mockResolvedValue(1),
      writeScrapingLog: vi.fn().mockResolvedValue(undefined),
      invalidateLibraryReadCaches: vi.fn(),
      requestDelayMs: 1500,
      maxSeasonRetries: 1,
      sleep,
      onProgress
    });

    expect(total).toBe(4);
    expect(syncSeason).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledWith(6000);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'retrying',
      year: 2026,
      season: 'winter',
      attempt: 1
    }));
  });

  it('serializa un rango desde 2010 sin lanzar temporadas en paralelo', async () => {
    const activeCalls: number[] = [];
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    const syncSeason = vi.fn(async () => {
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      activeCalls.push(concurrentCalls);
      concurrentCalls -= 1;
      return [];
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await runMassiveYearSync({
      startYear: 2010,
      currentYear: 2026,
      syncSeason,
      saveAnimeToLocal: vi.fn(),
      writeScrapingLog: vi.fn().mockResolvedValue(undefined),
      invalidateLibraryReadCaches: vi.fn(),
      requestDelayMs: 1500,
      sleep
    });

    expect(syncSeason).toHaveBeenCalledTimes(17 * SCRAPING_SEASONS.length);
    expect(sleep).toHaveBeenCalledTimes((17 * SCRAPING_SEASONS.length) - 1);
    expect(sleep).toHaveBeenCalledWith(1500);
    expect(maxConcurrentCalls).toBe(1);
    expect(activeCalls.every(value => value === 1)).toBe(true);
  });
});
