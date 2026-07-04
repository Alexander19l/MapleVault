import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createEpisodeRouter } from '../episodeRoutes';

describe('rutas de episodios de AnimeAV1', () => {
  it('reemplaza un slug base cacheado cuando el anime es una temporada posterior', async () => {
    const queryClient = {
      get: vi.fn(async () => ({
        id: 9317,
        title: 'My Hero Academia Season 2',
        title_romaji: 'Boku no Hero Academia 2',
        title_english: 'My Hero Academia Season 2',
        mal_id: 33486,
        year: 2017,
        type: 'tv',
        animeav1_slug: 'boku-no-hero-academia'
      })),
      all: vi.fn(async () => []),
      run: vi.fn(async () => ({ lastID: 0, changes: 1 }))
    };
    const getAnimeAV1Media = vi.fn(async (slug: string) => {
      if (slug === 'boku-no-hero-academia') {
        return {
          title: 'Boku no Hero Academia',
          slug,
          malId: 31964,
          startDate: '2016-04-03',
          endDate: '2016-06-26',
          category: { name: 'TV Anime', slug: 'tv-anime' },
          episodes: [{ id: 1, number: 1 }],
          declaredEpisodesCount: 1,
          extractionSource: 'sveltekit' as const
        };
      }

      return {
        title: 'Boku no Hero Academia 2nd Season',
        slug,
        malId: 33486,
        startDate: '2017-04-01',
        endDate: '2017-09-30',
        category: { name: 'TV Anime', slug: 'tv-anime' },
        episodes: [
          { id: 201, number: 1 },
          { id: 202, number: 2 }
        ],
        declaredEpisodesCount: 2,
        extractionSource: 'sveltekit' as const
      };
    });
    const getAnimeAV1Slug = vi.fn(async () => 'boku-no-hero-academia-2nd-season');
    const unused = vi.fn(async () => []);
    const scraperService = {
      getAnimeAV1Slug,
      getAnimeAV1Episodes: unused,
      getAnimeAV1Media,
      getAnimeAV1Embeds: unused,
      getTioAnimeSlug: vi.fn(async () => null),
      getTioAnimeEpisodes: unused,
      getTioAnimeServers: unused,
      getJKAnimeSlug: vi.fn(async () => null),
      getJKAnimeEpisodes: unused,
      getJKAnimeServers: unused,
      getAnimeFLVSlug: vi.fn(async () => null),
      getAnimeFLVEpisodes: unused,
      getAnimeFLVServers: unused
    };

    const app = express();
    app.use(createEpisodeRouter({
      queryClient: queryClient as any,
      scraperService: scraperService as any
    }));
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/anime/9317/episodes`);
      const body = await response.json() as {
        slug: string;
        episodes: Array<{ id: number; number: number }>;
        availability: string;
        extractionSource: string;
      };

      expect(response.status).toBe(200);
      expect(body.slug).toBe('boku-no-hero-academia-2nd-season');
      expect(body.episodes).toEqual([
        { id: 201, number: 1 },
        { id: 202, number: 2 }
      ]);
      expect(body.availability).toBe('available');
      expect(body.extractionSource).toBe('sveltekit');
      expect(getAnimeAV1Media).toHaveBeenNthCalledWith(1, 'boku-no-hero-academia');
      expect(getAnimeAV1Media).toHaveBeenNthCalledWith(2, 'boku-no-hero-academia-2nd-season');
      expect(getAnimeAV1Slug).toHaveBeenCalledWith(
        'My Hero Academia Season 2',
        'Boku no Hero Academia 2',
        'My Hero Academia Season 2',
        ['boku-no-hero-academia']
      );
      expect(queryClient.run).toHaveBeenNthCalledWith(
        1,
        'UPDATE anime SET animeav1_slug = NULL WHERE id = ?',
        [9317]
      );
      expect(queryClient.run).toHaveBeenNthCalledWith(
        2,
        'UPDATE anime SET animeav1_slug = ? WHERE id = ?',
        ['boku-no-hero-academia-2nd-season', 9317]
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });

  it('distingue una serie encontrada que todavía no tiene capítulos publicados', async () => {
    const queryClient = {
      get: vi.fn(async () => ({
        id: 20,
        title: 'Upcoming Anime',
        title_romaji: 'Upcoming Anime',
        title_english: 'Upcoming Anime',
        mal_id: 50000,
        year: 2027,
        type: 'tv',
        animeav1_slug: 'upcoming-anime'
      })),
      all: vi.fn(async () => []),
      run: vi.fn(async () => ({ lastID: 0, changes: 0 }))
    };
    const unused = vi.fn(async () => []);
    const scraperService = {
      getAnimeAV1Slug: vi.fn(async () => null),
      getAnimeAV1Episodes: unused,
      getAnimeAV1Media: vi.fn(async () => ({
        title: 'Upcoming Anime',
        slug: 'upcoming-anime',
        malId: 50000,
        startDate: '2027-01-01',
        endDate: null,
        category: { name: 'TV Anime', slug: 'tv-anime' },
        episodes: [],
        declaredEpisodesCount: 0,
        extractionSource: 'sveltekit' as const
      })),
      getAnimeAV1Embeds: unused,
      getTioAnimeSlug: vi.fn(async () => null),
      getTioAnimeEpisodes: unused,
      getTioAnimeServers: unused,
      getJKAnimeSlug: vi.fn(async () => null),
      getJKAnimeEpisodes: unused,
      getJKAnimeServers: unused,
      getAnimeFLVSlug: vi.fn(async () => null),
      getAnimeFLVEpisodes: unused,
      getAnimeFLVServers: unused
    };
    const app = express();
    app.use(createEpisodeRouter({
      queryClient: queryClient as any,
      scraperService: scraperService as any
    }));
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/anime/20/episodes`);
      const body = await response.json() as {
        availability: string;
        episodes: unknown[];
      };

      expect(response.status).toBe(200);
      expect(body.availability).toBe('not_published');
      expect(body.episodes).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });

  it('descarta otras temporadas y continua con el candidato correcto', async () => {
    const queryClient = {
      get: vi.fn(async () => ({
        id: 11307,
        external_id: 117193,
        source: 'AniList',
        mal_id: 41587,
        title: 'My Hero Academia Season 5',
        title_romaji: 'Boku no Hero Academia 5',
        title_english: 'My Hero Academia Season 5',
        year: 2021,
        type: 'tv',
        animeav1_slug: 'boku-no-hero-academia'
      })),
      all: vi.fn(async () => []),
      run: vi.fn(async () => ({ lastID: 0, changes: 1 }))
    };
    const getAnimeAV1Slug = vi.fn()
      .mockResolvedValueOnce('boku-no-hero-academia-4th-season')
      .mockResolvedValueOnce('boku-no-hero-academia-5th-season');
    const getAnimeAV1Media = vi.fn(async (slug: string) => {
      const metadata: Record<string, { title: string; malId: number; startDate: string }> = {
        'boku-no-hero-academia': {
          title: 'Boku no Hero Academia',
          malId: 31964,
          startDate: '2016-04-03'
        },
        'boku-no-hero-academia-4th-season': {
          title: 'Boku no Hero Academia 4th Season',
          malId: 38408,
          startDate: '2019-10-12'
        },
        'boku-no-hero-academia-5th-season': {
          title: 'Boku no Hero Academia 5th Season',
          malId: 41587,
          startDate: '2021-03-27'
        }
      };
      return {
        ...metadata[slug],
        slug,
        endDate: null,
        category: { name: 'TV Anime', slug: 'tv-anime' },
        episodes: [{ id: 1, number: 1 }],
        declaredEpisodesCount: 1,
        extractionSource: 'sveltekit' as const
      };
    });
    const unused = vi.fn(async () => []);
    const app = express();
    app.use(createEpisodeRouter({
      queryClient: queryClient as any,
      scraperService: {
        getAnimeAV1Slug,
        getAnimeAV1Media,
        getAnimeAV1Episodes: unused,
        getAnimeAV1Embeds: unused,
        getTioAnimeSlug: vi.fn(async () => null),
        getTioAnimeEpisodes: unused,
        getTioAnimeServers: unused,
        getJKAnimeSlug: vi.fn(async () => null),
        getJKAnimeEpisodes: unused,
        getJKAnimeServers: unused,
        getAnimeFLVSlug: vi.fn(async () => null),
        getAnimeFLVEpisodes: unused,
        getAnimeFLVServers: unused
      } as any
    }));
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/anime/11307/episodes`);
      const body = await response.json() as { slug: string };

      expect(response.status).toBe(200);
      expect(body.slug).toBe('boku-no-hero-academia-5th-season');
      expect(getAnimeAV1Slug).toHaveBeenNthCalledWith(
        1,
        'My Hero Academia Season 5',
        'Boku no Hero Academia 5',
        'My Hero Academia Season 5',
        ['boku-no-hero-academia']
      );
      expect(getAnimeAV1Slug).toHaveBeenNthCalledWith(
        2,
        'My Hero Academia Season 5',
        'Boku no Hero Academia 5',
        'My Hero Academia Season 5',
        ['boku-no-hero-academia', 'boku-no-hero-academia-4th-season']
      );
      expect(queryClient.run).toHaveBeenLastCalledWith(
        'UPDATE anime SET animeav1_slug = ? WHERE id = ?',
        ['boku-no-hero-academia-5th-season', 11307]
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });

  it('bloquea la reproduccion directa cuando el slug pertenece a otra temporada', async () => {
    const queryClient = {
      get: vi.fn(async () => ({
        id: 13696,
        external_id: 185874,
        source: 'AniList',
        mal_id: 60636,
        title: 'BLEACH: Thousand-Year Blood War - The Calamity',
        title_romaji: 'BLEACH: Sennen Kessen-hen - Kashin-tan',
        year: 2026,
        type: 'tv',
        animeav1_slug: 'bleach-sennen-kessen-hen'
      })),
      all: vi.fn(async () => []),
      run: vi.fn(async () => ({ lastID: 0, changes: 1 }))
    };
    const getAnimeAV1Embeds = vi.fn(async () => []);
    const unused = vi.fn(async () => []);
    const app = express();
    app.use(createEpisodeRouter({
      queryClient: queryClient as any,
      scraperService: {
        getAnimeAV1Slug: vi.fn(async () => null),
        getAnimeAV1Media: vi.fn(async () => ({
          title: 'Bleach: Sennen Kessen-hen',
          slug: 'bleach-sennen-kessen-hen',
          malId: 41467,
          startDate: '2022-10-11',
          endDate: '2022-12-27',
          category: { name: 'TV Anime', slug: 'tv-anime' },
          episodes: [{ id: 1, number: 1 }],
          declaredEpisodesCount: 1,
          extractionSource: 'sveltekit' as const
        })),
        getAnimeAV1Episodes: unused,
        getAnimeAV1Embeds,
        getTioAnimeSlug: vi.fn(async () => null),
        getTioAnimeEpisodes: unused,
        getTioAnimeServers: unused,
        getJKAnimeSlug: vi.fn(async () => null),
        getJKAnimeEpisodes: unused,
        getJKAnimeServers: unused,
        getAnimeFLVSlug: vi.fn(async () => null),
        getAnimeFLVEpisodes: unused,
        getAnimeFLVServers: unused
      } as any
    }));
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/anime/13696/episodes/1`);
      const body = await response.json() as { code: string };

      expect(response.status).toBe(404);
      expect(body.code).toBe('ANIMEAV1_IDENTITY_NOT_VERIFIED');
      expect(getAnimeAV1Embeds).not.toHaveBeenCalled();
      expect(queryClient.run).toHaveBeenCalledWith(
        'UPDATE anime SET animeav1_slug = NULL WHERE id = ?',
        [13696]
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });
});
