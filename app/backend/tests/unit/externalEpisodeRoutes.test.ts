import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExternalEpisodeRouter } from '../../src/routes/externalEpisodeRoutes';
import type { ExternalEpisodeProviderRegistry } from '../../src/episodes/externalEpisodeProviders';

const getMock = vi.fn();
const runMock = vi.fn();
const findSeries = vi.fn();
const getEpisodes = vi.fn();
const getServers = vi.fn();

const provider = {
  descriptor: {
    id: 'aniwatch' as const,
    label: 'Aniwatch',
    language: 'en' as const,
    baseUrl: 'https://aniwatch.co.at',
    stability: 'beta' as const
  },
  findSeries,
  getEpisodes,
  getServers
};

let server: Server;
let baseUrl: string;

describe('external episode routes', () => {
  beforeAll(async () => {
    const app = express();
    app.use(createExternalEpisodeRouter({
      queryClient: { get: getMock, run: runMock },
      providers: new Map([['aniwatch', provider]]) as ExternalEpisodeProviderRegistry
    }));
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async (sql: string) => (
      sql.includes('FROM anime_episode_sources')
        ? null
        : { id: 9, title: 'Maple Show', title_romaji: 'Maple Show', year: 2024, type: 'tv' }
    ));
    runMock.mockResolvedValue({ lastID: 1, changes: 1 });
    findSeries.mockResolvedValue({
      animeId: 9,
      providerId: 'aniwatch',
      externalKey: '500',
      sourceTitle: 'Maple Show',
      sourceUrl: 'https://aniwatch.co.at/maple-show-episode-1/'
    });
    getEpisodes.mockResolvedValue([
      { id: '501', number: 1, title: 'Inicio', url: 'https://aniwatch.co.at/maple-show-episode-1/' }
    ]);
    getServers.mockResolvedValue({
      referer: 'https://aniwatch.co.at/maple-show-episode-1/',
      variants: { SUB: [{ server: 'VidSrc', url: 'https://player.example/embed/1' }] }
    });
  });

  it('expone descriptores de fuente para la interfaz', async () => {
    const response = await fetch(`${baseUrl}/episode-sources`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([provider.descriptor]);
  });

  it('verifica y persiste la asociación antes de devolver episodios', async () => {
    const response = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/9/episodes`);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.episodes[0]).toMatchObject({ number: 1, id: '501' });
    expect(findSeries).toHaveBeenCalledOnce();
    expect(runMock).toHaveBeenCalledWith(expect.stringContaining('anime_episode_sources'), [
      9,
      'aniwatch',
      '500',
      'Maple Show',
      'https://aniwatch.co.at/maple-show-episode-1/'
    ]);
  });

  it('devuelve servidores ingleses en ventana aislada con Referer explícito', async () => {
    const response = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/9/episodes/1/servers`);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.SUB[0]).toMatchObject({
      providerId: 'aniwatch',
      language: 'en',
      referer: 'https://aniwatch.co.at/maple-show-episode-1/',
      playbackMode: 'window'
    });
  });

  it('conserva el modo directo declarado por un servidor que no admite iframe', async () => {
    getServers.mockResolvedValueOnce({
      referer: 'https://aniwatch.co.at/maple-show-episode-1/',
      variants: {
        SUB: [{
          server: 'Vidplay',
          url: 'https://player.example/embed/1',
          playbackMode: 'direct-window'
        }]
      }
    });

    const response = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/9/episodes/1/servers`);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.SUB[0].playbackMode).toBe('direct-window');
  });

  it('reutiliza la lista de episodios al solicitar servidores del mismo anime', async () => {
    getMock.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM anime_episode_sources')) return null;
      const animeId = Number(params?.[0] || 77);
      return { id: animeId, title: 'Cached Show', title_romaji: 'Cached Show', year: 2024, type: 'tv' };
    });
    findSeries.mockResolvedValue({
      animeId: 77,
      providerId: 'aniwatch',
      externalKey: '770',
      sourceTitle: 'Cached Show',
      sourceUrl: 'https://aniwatch.co.at/cached-show-episode-1/'
    });
    getEpisodes.mockResolvedValue([
      { id: '771', number: 1, title: 'Inicio', url: 'https://aniwatch.co.at/cached-show-episode-1/' }
    ]);

    const listResponse = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/77/episodes`);
    const serversResponse = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/77/episodes/1/servers`);

    expect(listResponse.status).toBe(200);
    expect(serversResponse.status).toBe(200);
    expect(getEpisodes).toHaveBeenCalledOnce();
  });

  it('descarta una asociación almacenada que apunta a otra serie o temporada', async () => {
    getMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM anime_episode_sources')) {
        return {
          anime_id: 9,
          provider_id: 'aniwatch',
          external_key: 'wrong-binding',
          source_title: 'Boku no Hero Academia Vigilantes',
          source_url: 'https://aniwatch.co.at/boku-no-hero-vigilantes/'
        };
      }
      return {
        id: 9,
        title: 'Boku no Hero Academia',
        title_romaji: 'Boku no Hero Academia',
        year: 2016,
        type: 'tv'
      };
    });
    findSeries.mockResolvedValue({
      animeId: 9,
      providerId: 'aniwatch',
      externalKey: 'correct-binding',
      sourceTitle: 'Boku no Hero Academia',
      sourceUrl: 'https://aniwatch.co.at/boku-no-hero-academia/'
    });

    const response = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/9/episodes`);

    expect(response.status).toBe(200);
    expect(runMock.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM anime_episode_sources'))).toBe(true);
    expect(findSeries).toHaveBeenCalledOnce();
  });

  it('rechaza proveedores y números de episodio no permitidos', async () => {
    const missingProvider = await fetch(`${baseUrl}/episode-sources/unknown/anime/9/episodes`);
    const invalidEpisode = await fetch(`${baseUrl}/episode-sources/aniwatch/anime/9/episodes/1--force/servers`);

    expect(missingProvider.status).toBe(404);
    expect(invalidEpisode.status).toBe(400);
    expect(getServers).not.toHaveBeenCalled();
  });
});
