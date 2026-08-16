import { describe, expect, it } from 'vitest';
import { ScrapingJobTracker } from '../../src/routes/scrapingJobTracker';

describe('Scraping job tracker', () => {
  it('calcula progreso, importados y reintentos de un trabajo masivo', () => {
    const tracker = new ScrapingJobTracker();
    tracker.startMassive(2025, 2026, 1500);
    tracker.apply({ type: 'season_started', year: 2025, season: 'winter' });
    tracker.apply({
      type: 'retrying',
      year: 2025,
      season: 'winter',
      attempt: 1,
      delayMs: 6000,
      message: 'Too many requests'
    });
    tracker.apply({
      type: 'season_completed',
      year: 2025,
      season: 'winter',
      imported: 42
    });

    expect(tracker.getStatus()).toEqual(expect.objectContaining({
      state: 'running',
      totalSeasons: 8,
      completedSeasons: 1,
      successfulSeasons: 1,
      totalImported: 42,
      retryCount: 1,
      progressPercent: 13
    }));

    tracker.complete(42);
    expect(tracker.getStatus()).toEqual(expect.objectContaining({
      state: 'completed',
      progressPercent: 100
    }));
  });

  it('impide iniciar dos trabajos simultáneos', () => {
    const tracker = new ScrapingJobTracker();
    tracker.startMassive(2020, 2026, 1500);

    expect(() => tracker.startSeason(2026, 'summer', 1500))
      .toThrow('Ya hay una sincronización en curso.');
  });

  it('termina con advertencia cuando alguna temporada falla', () => {
    const tracker = new ScrapingJobTracker();
    tracker.startMassive(2026, 2026, 1500);
    tracker.apply({
      type: 'season_failed',
      year: 2026,
      season: 'winter',
      message: 'AniList no disponible'
    });
    tracker.complete(0);

    expect(tracker.getStatus()).toEqual(expect.objectContaining({
      state: 'completed_with_errors',
      failedSeasons: 1,
      lastError: 'AniList no disponible'
    }));
  });
});
