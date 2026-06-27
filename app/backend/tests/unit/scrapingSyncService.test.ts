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

    const total = await runMassiveYearSync({
      startYear: 2026,
      currentYear: 2026,
      syncSeason,
      saveAnimeToLocal,
      writeScrapingLog,
      invalidateLibraryReadCaches,
      logger
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
      'Fallo: fuente caida'
    );
    expect(writeScrapingLog).toHaveBeenCalledWith(
      'Massive Scraping',
      'Sincronización masiva terminada',
      'success',
      expect.stringContaining('Total de animes importados/actualizados: 3')
    );
    expect(invalidateLibraryReadCaches).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledWith('Error en scraping masivo para 2026 spring:', 'fuente caida');
  });
});
