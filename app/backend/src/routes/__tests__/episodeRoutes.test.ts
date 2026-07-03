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
          episodes: [{ id: 1, number: 1 }]
        };
      }

      return {
        title: 'Boku no Hero Academia 2nd Season',
        slug,
        episodes: [
          { id: 201, number: 1 },
          { id: 202, number: 2 }
        ]
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
      };

      expect(response.status).toBe(200);
      expect(body.slug).toBe('boku-no-hero-academia-2nd-season');
      expect(body.episodes).toEqual([
        { id: 201, number: 1 },
        { id: 202, number: 2 }
      ]);
      expect(getAnimeAV1Media).toHaveBeenNthCalledWith(1, 'boku-no-hero-academia');
      expect(getAnimeAV1Media).toHaveBeenNthCalledWith(2, 'boku-no-hero-academia-2nd-season');
      expect(getAnimeAV1Slug).toHaveBeenCalledWith(
        'My Hero Academia Season 2',
        'Boku no Hero Academia 2',
        'My Hero Academia Season 2'
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
});
