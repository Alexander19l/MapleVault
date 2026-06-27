import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryRouter } from '../../src/routes/libraryRoutes';
import { invalidateLibraryReadCaches } from '../../src/routes/libraryCache';

const queryGetMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();
const queryAllMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any[]>>();
const queryRunMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();
const searchAniListMock = vi.fn();
const getAniListAnimeByIdMock = vi.fn();
const saveNormalizedAnimeToLocalMock = vi.fn();
const recommendationServiceMock = vi.fn();
const translateListMock = vi.fn();
const translateOneMock = vi.fn();
const attachGenresMock = vi.fn((rows: any[]) => rows.map(row => ({
  ...row,
  genres: row.genres_joined ? String(row.genres_joined).split(',') : []
})));
const invalidateCachesMock = vi.fn();

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

describe('Library HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(createLibraryRouter({
      queryClient: {
        get: queryGetMock,
        all: queryAllMock,
        run: queryRunMock
      },
      externalAnimeService: {
        searchAniList: searchAniListMock as any,
        getAniListAnimeById: getAniListAnimeByIdMock as any,
        saveNormalizedAnimeToLocal: saveNormalizedAnimeToLocalMock as any
      },
      recommendationService: recommendationServiceMock as any,
      translationService: {
        decorateAnimeListWithSpanishTranslation: translateListMock as any,
        decorateAnimeWithSpanishTranslation: translateOneMock as any
      },
      attachGenres: attachGenresMock as any,
      invalidateReadCaches: invalidateCachesMock,
      getCurrentDate: () => new Date('2026-06-26T12:00:00.000Z')
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
    invalidateLibraryReadCaches();
    queryGetMock.mockResolvedValue(null);
    queryAllMock.mockResolvedValue([]);
    queryRunMock.mockResolvedValue({ lastID: 1, changes: 1 });
    searchAniListMock.mockResolvedValue([{ title: 'Online Maple' }]);
    getAniListAnimeByIdMock.mockResolvedValue(null);
    saveNormalizedAnimeToLocalMock.mockResolvedValue(99);
    recommendationServiceMock.mockResolvedValue([{ id: 7, title: 'Recommended Maple' }]);
    translateListMock.mockImplementation(async rows => rows);
    translateOneMock.mockImplementation(async row => row);
  });

  it('lista anime con filtros, traduccion y total opcional', async () => {
    queryAllMock.mockResolvedValueOnce([
      { id: 1, title: 'Maple', genres_joined: 'Action,Comedy' }
    ]);
    queryGetMock.mockResolvedValueOnce({ total: 12 });

    const { response, json } = await requestJson('/anime?q=maple&limit=2&withTotal=true&translateSynopsis=true');

    expect(response.status).toBe(200);
    expect(json).toEqual({
      items: [{ id: 1, title: 'Maple', genres_joined: 'Action,Comedy', genres: ['Action', 'Comedy'] }],
      total: 12,
      limit: 2,
      offset: 0
    });
    expect(queryAllMock.mock.calls[0][0]).toContain('a.title LIKE ?');
    expect(queryAllMock.mock.calls[0][1]).toEqual(['%maple%', '%maple%', '%maple%', 2, 0]);
    expect(translateListMock).toHaveBeenCalledWith(
      [expect.objectContaining({ title: 'Maple', genres: ['Action', 'Comedy'] })],
      { maxRowsToTranslate: 1 }
    );
  });

  it('cachea resumen de Inicio e invalida con el cache compartido', async () => {
    queryGetMock.mockImplementation(async sql => {
      if (sql.includes('FROM anime a WHERE')) return { count: 3 };
      if (sql.includes('favorite = 1')) return { count: 1 };
      return null;
    });
    queryAllMock.mockImplementation(async sql => {
      if (sql.includes('FROM user_list') && sql.includes('GROUP BY watch_status')) {
        return [{ watch_status: 'watching', count: 2 }];
      }
      if (sql.includes('a.status =')) {
        return [{ id: 2, title: 'Airing Maple' }];
      }
      return [{ id: 1, title: 'Recent Maple' }];
    });

    const first = await requestJson('/dashboard/summary');
    const second = await requestJson('/dashboard/summary');

    expect(first.response.status).toBe(200);
    expect(first.response.headers.get('x-maplevault-cache')).toBe('miss');
    expect(second.response.headers.get('x-maplevault-cache')).toBe('hit');
    expect(first.json.stats).toMatchObject({
      total: 3,
      watching: 2,
      favorites: 1
    });
    expect(queryGetMock).toHaveBeenCalledTimes(2);
  });

  it('crea anime manual y guarda generos invalidando caches', async () => {
    queryRunMock
      .mockResolvedValueOnce({ lastID: 42, changes: 1 })
      .mockResolvedValue({ lastID: 0, changes: 1 });
    queryGetMock.mockResolvedValue({ id: 5 });

    const { response, json } = await requestJson('/anime', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Manual Maple',
        year: 2026,
        season: 'winter',
        status: 'finished',
        type: 'tv',
        genres: ['Action']
      })
    });

    expect(response.status).toBe(201);
    expect(json).toEqual({ id: 42, message: 'Anime creado con exito' });
    expect(queryRunMock.mock.calls[0][0]).toContain('INSERT INTO anime');
    expect(queryRunMock).toHaveBeenCalledWith('INSERT OR IGNORE INTO genres (name) VALUES (?)', ['Action']);
    expect(invalidateCachesMock).toHaveBeenCalledTimes(1);
  });

  it('actualiza lista personal con fechas deterministicas', async () => {
    const added = await requestJson('/user-list', {
      method: 'POST',
      body: JSON.stringify({
        anime_id: 10,
        watch_status: 'watching',
        favorite: 1,
        user_score: 8,
        episodes_watched: 2,
        notes: 'en curso'
      })
    });

    queryGetMock.mockResolvedValueOnce({ id: 3, watch_status: 'watching' });
    const updated = await requestJson('/user-list/3', {
      method: 'PUT',
      body: JSON.stringify({
        watch_status: 'completed',
        favorite: 1,
        user_score: 9,
        episodes_watched: 12,
        notes: 'terminada'
      })
    });

    expect(added.response.status).toBe(201);
    expect(queryRunMock.mock.calls[0][1]).toContain('2026-06-26');
    expect(updated.response.status).toBe(200);
    expect(queryRunMock.mock.calls.at(-1)?.[1]).toEqual([
      'completed',
      1,
      9,
      12,
      'terminada',
      '2026-06-26',
      3
    ]);
  });

  it('resuelve busqueda online, recomendaciones y generos', async () => {
    queryAllMock.mockResolvedValueOnce([{ name: 'Action' }]);

    const emptySearch = await requestJson('/search');
    const search = await requestJson('/search?q=lain');
    const recommendations = await requestJson('/recommendations');
    const genres = await requestJson('/genres');

    expect(emptySearch.json).toEqual([]);
    expect(search.response.status).toBe(200);
    expect(searchAniListMock).toHaveBeenCalledWith('lain');
    expect(recommendations.json).toEqual([{ id: 7, title: 'Recommended Maple' }]);
    expect(genres.json).toEqual(['Action']);
  });

  it('consulta ficha externa y decora relaciones con ids locales', async () => {
    getAniListAnimeByIdMock.mockResolvedValueOnce({
      external_id: 100,
      title: 'External Maple',
      relations: [
        { related_external_id: 200, relation_type: 'SEQUEL' },
        { related_external_id: 201, relation_type: 'PREQUEL' }
      ]
    });
    queryAllMock.mockResolvedValueOnce([{ id: 44, external_id: 200 }]);

    const { response, json } = await requestJson('/anime/external/anilist/100');

    expect(response.status).toBe(200);
    expect(json.relations).toEqual([
      { related_external_id: 200, relation_type: 'SEQUEL', local_anime_id: 44 },
      { related_external_id: 201, relation_type: 'PREQUEL', local_anime_id: null }
    ]);
    expect(translateOneMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'External Maple' }));
  });

  it('importa anime y expone duplicados normalizados', async () => {
    const imported = await requestJson('/anime/import', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Imported Maple',
        year: 2026,
        season: 'spring',
        status: 'finished',
        type: 'tv'
      })
    });

    queryAllMock.mockResolvedValueOnce([
      {
        normalized_title: 'maple',
        year: 2026,
        count: 2,
        ids: '1,2',
        sources: 'AniList,Jikan'
      }
    ]);
    const duplicates = await requestJson('/maintenance/duplicates');

    expect(imported.response.status).toBe(200);
    expect(saveNormalizedAnimeToLocalMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Imported Maple' }));
    expect(invalidateCachesMock).toHaveBeenCalledTimes(1);
    expect(duplicates.json).toEqual([
      {
        normalized_title: 'maple',
        year: 2026,
        count: 2,
        ids: [1, 2],
        sources: ['AniList', 'Jikan']
      }
    ]);
  });
});
