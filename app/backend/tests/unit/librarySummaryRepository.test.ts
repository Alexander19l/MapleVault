import { describe, expect, it, vi } from 'vitest';
import {
  getDashboardSummaryData,
  getSeasonsSummaryData
} from '../../src/routes/librarySummaryRepository';

describe('Library summary repository', () => {
  it('normaliza estadisticas de Inicio y conserva filas para decorar en el router', async () => {
    const queryClient = {
      get: vi.fn()
        .mockResolvedValueOnce({ count: 25 })
        .mockResolvedValueOnce({ count: 4 }),
      all: vi.fn()
        .mockResolvedValueOnce([
          { watch_status: 'watching', count: 3 },
          { watch_status: 'plan_to_watch', count: 8 },
          { watch_status: 'completed', count: 14 }
        ])
        .mockResolvedValueOnce([{ id: 10, title: 'Recent Maple' }])
        .mockResolvedValueOnce([{ id: 11, title: 'Airing Maple' }])
    };

    const summary = await getDashboardSummaryData(queryClient);

    expect(summary.stats).toEqual({
      total: 25,
      watching: 3,
      pending: 8,
      completed: 14,
      favorites: 4
    });
    expect(summary.recentRows).toEqual([{ id: 10, title: 'Recent Maple' }]);
    expect(summary.airingRows).toEqual([{ id: 11, title: 'Airing Maple' }]);
    expect(queryClient.get.mock.calls[0][0]).toContain("g2.name = 'Hentai'");
    expect(queryClient.all).toHaveBeenCalledTimes(3);
  });

  it('normaliza resumen de temporadas y calcula mejores comparativas', async () => {
    const queryClient = {
      get: vi.fn().mockResolvedValueOnce({ studio: 'Kyoto Animation', count: 6 }),
      all: vi.fn()
        .mockResolvedValueOnce([{ year: 2026 }, { year: 2025 }, { year: null }])
        .mockResolvedValueOnce([
          { year: 2026, season: 'winter', count: 5, avg_score: 7.9 },
          { year: 2025, season: 'spring', count: 3, avg_score: 8.6 },
          { year: null, season: 'summer', count: 10, avg_score: 9.1 }
        ])
        .mockResolvedValueOnce([
          { name: 'Comedy', count: 9 },
          { name: 'Romance', count: 7 }
        ])
    };

    const summary = await getSeasonsSummaryData(queryClient);

    expect(summary).toEqual({
      years: [2026, 2025],
      countsBySeason: {
        '2026:winter': 5,
        '2025:spring': 3
      },
      comparisons: {
        bestCountSeason: 'Winter 2026 (5 series)',
        bestScoreSeason: 'Spring 2025 (Nota: 8.6)',
        topGenres: ['Comedy', 'Romance'],
        topStudio: 'Kyoto Animation',
        studioCount: 6
      }
    });
    expect(queryClient.all.mock.calls[1][0]).toContain('GROUP BY a.year, a.season');
  });
});
