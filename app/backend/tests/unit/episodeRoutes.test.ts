import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEpisodeRouter, prioritizeServers } from '../../src/routes/episodeRoutes';

const queryGetMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();
const queryAllMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any[]>>();
const queryRunMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();

const scraperService = {
  getAnimeAV1Slug: vi.fn(),
  getAnimeAV1Episodes: vi.fn(),
  getAnimeAV1Media: vi.fn(),
  getAnimeAV1Embeds: vi.fn(),
  getTioAnimeSlug: vi.fn(),
  getTioAnimeEpisodes: vi.fn(),
  getTioAnimeServers: vi.fn(),
  getJKAnimeSlug: vi.fn(),
  getJKAnimeEpisodes: vi.fn(),
  getJKAnimeServers: vi.fn(),
  getAnimeFLVSlug: vi.fn(),
  getAnimeFLVEpisodes: vi.fn(),
  getAnimeFLVServers: vi.fn()
};

let server: Server;
let baseUrl: string;

async function requestJson(requestPath: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  return {
    response,
    json: await response.json()
  };
}

describe('Episode HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(createEpisodeRouter({
      queryClient: {
        get: queryGetMock,
        all: queryAllMock,
        run: queryRunMock
      },
      scraperService: scraperService as any
    }));

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
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
    queryGetMock.mockResolvedValue(null);
    queryAllMock.mockResolvedValue([]);
    queryRunMock.mockResolvedValue({ changes: 1 });
    scraperService.getAnimeAV1Slug.mockResolvedValue('maple-av1');
    scraperService.getAnimeAV1Episodes.mockResolvedValue([{ number: 1, title: 'Inicio' }]);
    scraperService.getAnimeAV1Media.mockResolvedValue({
      title: 'Maple Show',
      slug: 'maple-av1',
      malId: null,
      startDate: '2024-01-01',
      endDate: null,
      category: { name: 'TV Anime', slug: 'tv-anime' },
      episodes: [{ id: 1, number: 1 }]
    });
    scraperService.getAnimeAV1Embeds.mockResolvedValue([
      { server: 'StreamSB' },
      { server: 'Mega' }
    ]);
    scraperService.getTioAnimeSlug.mockResolvedValue('maple-tio');
    scraperService.getTioAnimeEpisodes.mockResolvedValue([{ number: 1 }]);
    scraperService.getTioAnimeServers.mockResolvedValue([{ server: 'Okru' }]);
    scraperService.getJKAnimeSlug.mockResolvedValue('maple-jk');
    scraperService.getJKAnimeEpisodes.mockResolvedValue([{ number: 1 }]);
    scraperService.getJKAnimeServers.mockResolvedValue([{ server: '1fichier' }, { server: 'Okru' }]);
    scraperService.getAnimeFLVSlug.mockResolvedValue('maple-flv');
    scraperService.getAnimeFLVEpisodes.mockResolvedValue([{ number: 1 }]);
    scraperService.getAnimeFLVServers.mockResolvedValue([{ server: 'Streamtape' }]);
  });

  it('resuelve y cachea slug de AnimeAV1 antes de listar episodios', async () => {
    queryGetMock.mockResolvedValueOnce({
      id: 10,
      title: 'Maple Show',
      title_romaji: 'Maple Show',
      title_english: '',
      year: 2024,
      type: 'tv',
      animeav1_slug: ''
    });

    const { response, json } = await requestJson('/anime/10/episodes');

    expect(response.status).toBe(200);
    expect(json).toEqual({
      slug: 'maple-av1',
      episodes: [{ id: 1, number: 1 }],
      availability: 'available',
      sourceTitle: 'Maple Show'
    });
    expect(scraperService.getAnimeAV1Slug).toHaveBeenCalledWith('Maple Show', 'Maple Show', '', []);
    expect(scraperService.getAnimeAV1Media).toHaveBeenCalledWith('maple-av1');
    expect(queryRunMock).toHaveBeenCalledWith('UPDATE anime SET animeav1_slug = ? WHERE id = ?', ['maple-av1', 10]);
  });

  it('descarta y repara un slug AV1 persistido que pertenece a un spin-off', async () => {
    queryGetMock.mockResolvedValueOnce({
      id: 113,
      title: 'My Hero Academia',
      title_romaji: 'Boku no Hero Academia',
      title_english: 'My Hero Academia',
      year: 2016,
      type: 'tv',
      animeav1_slug: 'vigilante-boku-no-hero-academia-illegals-2nd-season'
    });
    scraperService.getAnimeAV1Slug.mockResolvedValueOnce('boku-no-hero-academia');
    scraperService.getAnimeAV1Media
      .mockResolvedValueOnce({
        title: 'Vigilante: Boku no Hero Academia Illegals 2nd Season',
        slug: 'vigilante-boku-no-hero-academia-illegals-2nd-season',
        malId: null,
        startDate: '2025-04-01',
        endDate: null,
        category: { name: 'TV Anime', slug: 'tv-anime' },
        episodes: [{ id: 10, number: 1 }]
      })
      .mockResolvedValueOnce({
        title: 'Boku no Hero Academia',
        slug: 'boku-no-hero-academia',
        malId: null,
        startDate: '2016-04-03',
        endDate: '2016-06-26',
        category: { name: 'TV Anime', slug: 'tv-anime' },
        episodes: [{ id: 20, number: 1 }]
      });

    const { response, json } = await requestJson('/anime/113/episodes');

    expect(response.status).toBe(200);
    expect(json).toEqual({
      slug: 'boku-no-hero-academia',
      episodes: [{ id: 20, number: 1 }],
      availability: 'available',
      sourceTitle: 'Boku no Hero Academia'
    });
    expect(queryRunMock).toHaveBeenNthCalledWith(
      1,
      'UPDATE anime SET animeav1_slug = NULL WHERE id = ?',
      [113]
    );
    expect(queryRunMock).toHaveBeenNthCalledWith(
      2,
      'UPDATE anime SET animeav1_slug = ? WHERE id = ?',
      ['boku-no-hero-academia', 113]
    );
    expect(scraperService.getAnimeAV1Slug).toHaveBeenCalledWith(
      'My Hero Academia',
      'Boku no Hero Academia',
      'My Hero Academia',
      ['vigilante-boku-no-hero-academia-illegals-2nd-season']
    );
  });

  it('devuelve episodios vistos y actualiza progreso al alternar visto', async () => {
    queryAllMock.mockResolvedValueOnce([{ episode_number: 1 }, { episode_number: 3 }]);

    const watched = await requestJson('/anime/10/watched-episodes');
    expect(watched.response.status).toBe(200);
    expect(watched.json).toEqual([1, 3]);

    queryGetMock.mockResolvedValueOnce({ cnt: 4 });
    const updated = await requestJson('/anime/10/episodes/4/watch', {
      method: 'POST',
      body: JSON.stringify({ watched: true })
    });

    expect(updated.response.status).toBe(200);
    expect(updated.json).toEqual({ success: true, watched: true, watchedCount: 4 });
    expect(queryRunMock).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)',
      [10, 4]
    );
    expect(queryRunMock).toHaveBeenCalledWith(
      'UPDATE user_list SET episodes_watched = ?, updated_at = CURRENT_TIMESTAMP WHERE anime_id = ?',
      [4, 10]
    );
  });

  it('rechaza ids invalidos en episodios vistos y parametros invalidos al marcar', async () => {
    const invalidList = await requestJson('/anime/not-number/watched-episodes');
    const invalidWatch = await requestJson('/anime/10/episodes/not-number/watch', {
      method: 'POST',
      body: JSON.stringify({ watched: true })
    });

    expect(invalidList.response.status).toBe(400);
    expect(invalidWatch.response.status).toBe(400);
    expect(queryRunMock).not.toHaveBeenCalled();
  });

  it('prioriza servidores fuertes al obtener reproductores de AnimeAV1', async () => {
    queryGetMock.mockResolvedValueOnce({
      id: 10,
      title: 'Maple Show',
      title_romaji: 'Maple Show',
      title_english: '',
      year: 2024,
      type: 'tv',
      animeav1_slug: 'maple-av1'
    });
    scraperService.getAnimeAV1Media.mockResolvedValueOnce({
      title: 'Maple Show',
      slug: 'maple-av1',
      malId: null,
      startDate: '2024-01-01',
      endDate: null,
      category: { name: 'TV Anime', slug: 'tv-anime' },
      episodes: [{ id: 2, number: 2 }]
    });

    const { response, json } = await requestJson('/anime/10/episodes/2');

    expect(response.status).toBe(200);
    expect(json[0].server).toBe('Mega');
    expect(scraperService.getAnimeAV1Embeds).toHaveBeenCalledWith('maple-av1', 2);
  });

  it('registra rutas alternativas compartidas para TioAnime, JKAnime y AnimeFLV', async () => {
    queryGetMock.mockResolvedValueOnce({
      id: 10,
      title: 'Maple Show',
      title_romaji: '',
      title_english: '',
      tioanime_slug: ''
    });
    const tio = await requestJson('/tioanime/10/episodes');

    queryGetMock.mockResolvedValueOnce({
      id: 10,
      jkanime_slug: 'maple-jk'
    });
    const jkServers = await requestJson('/jkanime/10/episodes/5/servers');

    queryGetMock.mockResolvedValueOnce({
      id: 10,
      animeflv_slug: ''
    });
    const flvMissing = await requestJson('/animeflv/10/episodes/2/servers');

    expect(tio.response.status).toBe(200);
    expect(tio.json.slug).toBe('maple-tio');
    expect(queryRunMock).toHaveBeenCalledWith('UPDATE anime SET tioanime_slug = ? WHERE id = ?', ['maple-tio', 10]);
    expect(jkServers.response.status).toBe(200);
    expect(scraperService.getJKAnimeServers).toHaveBeenCalledWith('https://jkanime.net/maple-jk/5/');
    expect(jkServers.json[0].server).toBe('1fichier');
    expect(flvMissing.response.status).toBe(404);
  });

  it('prioriza servidores tambien dentro de objetos anidados', () => {
    const sorted = prioritizeServers({
      primary: [{ name: 'Okru' }, { name: '1fichier' }],
      secondary: [{ server: 'Mega' }, { server: 'Streamtape' }]
    });

    expect(sorted.primary[0].name).toBe('1fichier');
    expect(sorted.secondary[0].server).toBe('Mega');
  });
});
