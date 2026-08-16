import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExternalEpisodeRouter } from '../../src/routes/externalEpisodeRoutes';
import type { ExternalEpisodeProviderRegistry } from '../../src/episodes/externalEpisodeProviders';
import type { ExternalEpisodeProvider } from '../../src/episodes/externalEpisodeTypes';

const providerIds = ['gogoanime', 'animepahe', 'aniwaves', 'aniwatch'] as const;
const sampledEpisodes = [1, 4, 8, 12];
const anime = { id: 42, title: 'Maple Test Series', title_romaji: 'Maple Test Series', year: 2024, type: 'tv' };
const queryClient = {
  get: vi.fn(async (sql: string) => sql.includes('FROM anime_episode_sources') ? null : anime),
  run: vi.fn(async () => ({ lastID: 1, changes: 1 }))
};

let server: Server;
let baseUrl = '';

function createProvider(id: typeof providerIds[number]): ExternalEpisodeProvider {
  return {
    descriptor: {
      id,
      label: id,
      language: 'en',
      baseUrl: `https://${id}.example.test`,
      stability: 'beta'
    },
    findSeries: vi.fn(async currentAnime => ({
      animeId: currentAnime.id,
      providerId: id,
      externalKey: `${id}-maple-test-series`,
      sourceTitle: currentAnime.title,
      sourceUrl: `https://${id}.example.test/maple-test-series/`
    })),
    getEpisodes: vi.fn(async binding => sampledEpisodes.map(number => ({
      id: `${binding.providerId}:episode-${number}`,
      number,
      title: `Episode ${number}`,
      url: `https://${binding.providerId}.example.test/maple-test-series/episode-${number}`
    }))),
    getServers: vi.fn(async (binding, episode) => ({
      referer: episode.url,
      variants: {
        SUB: [{
          server: 'Test player',
          url: `https://player.example.test/${binding.providerId}/${episode.number}`
        }]
      }
    }))
  };
}

describe('external episode providers: sampled chapter contract', () => {
  beforeAll(async () => {
    const providers = new Map(providerIds.map(id => [id, createProvider(id)])) as ExternalEpisodeProviderRegistry;
    const app = express();
    app.use(createExternalEpisodeRouter({ queryClient, providers }));
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it('expone las cuatro fuentes y conserva el idioma inglés', async () => {
    const response = await fetch(`${baseUrl}/episode-sources`);
    const providers = await response.json() as Array<{ id: string; language: string }>;

    expect(response.status).toBe(200);
    expect(providers.map(provider => provider.id)).toEqual(providerIds);
    expect(providers.every(provider => provider.language === 'en')).toBe(true);
  });

  for (const providerId of providerIds) {
    it(`resuelve capítulos aleatorios sin cruzarlos en ${providerId}`, async () => {
      for (const episodeNumber of sampledEpisodes) {
        const response = await fetch(`${baseUrl}/episode-sources/${providerId}/anime/42/episodes/${episodeNumber}/servers`);
        const body = await response.json() as any;

        expect(response.status).toBe(200);
        expect(body.SUB[0]).toMatchObject({
          providerId,
          language: 'en',
          referer: `https://${providerId}.example.test/maple-test-series/episode-${episodeNumber}`
        });
        expect(body.SUB[0].url).toContain(`/${episodeNumber}`);
      }
    });
  }

  it('rechaza un número de capítulo que no pertenece al listado', async () => {
    const response = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/42/episodes/99/servers`);
    expect(response.status).toBe(404);
  });
});
