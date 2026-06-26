import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTransferRouter } from '../../src/routes/dataTransferRoutes';
import type { NormalizedAnime } from '../../src/scraping/scraper';

const queryAllMock = vi.fn<(sql: string) => Promise<any[]>>();
const queryRunMock = vi.fn<(sql: string, params?: any[]) => Promise<{ lastID: number; changes: number }>>();
const saveAnimeToLocalMock = vi.fn<(anime: NormalizedAnime) => Promise<number>>();
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

describe('Data transfer HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(createDataTransferRouter({
      queryClient: {
        all: queryAllMock,
        run: queryRunMock
      },
      saveAnimeToLocal: saveAnimeToLocalMock,
      invalidateLibraryReadCaches: invalidateCachesMock
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
    queryAllMock.mockImplementation(async sql => {
      if (sql.includes('FROM anime')) {
        return [
          {
            id: 1,
            title: 'Serial Experiments Lain',
            year: 1998,
            genres_joined: 'Sci-Fi,Psychological'
          }
        ];
      }

      if (sql.includes('FROM user_list')) {
        return [
          {
            anime_id: 1,
            watch_status: 'completed',
            favorite: 1
          }
        ];
      }

      return [];
    });
    queryRunMock.mockResolvedValue({ lastID: 1, changes: 1 });
    saveAnimeToLocalMock.mockResolvedValue(1001);
  });

  it('exporta anime y lista del usuario manteniendo géneros normalizados', async () => {
    const { response, json } = await requestJson('/settings/export', {
      method: 'POST',
      body: '{}'
    });

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      version: '1.0.0',
      exportedAt: expect.any(String),
      animes: [
        expect.objectContaining({
          title: 'Serial Experiments Lain',
          genres: ['Sci-Fi', 'Psychological']
        })
      ],
      userList: [
        expect.objectContaining({
          anime_id: 1,
          watch_status: 'completed'
        })
      ]
    }));
  });

  it('rechaza importaciones sin arreglo de animes', async () => {
    const { response, json } = await requestJson('/settings/import', {
      method: 'POST',
      body: JSON.stringify({ animes: null })
    });

    expect(response.status).toBe(400);
    expect(json.error).toContain('Formato de importación inválido');
    expect(saveAnimeToLocalMock).not.toHaveBeenCalled();
    expect(invalidateCachesMock).not.toHaveBeenCalled();
  });

  it('importa animes válidos, restaura lista asociada e invalida cachés', async () => {
    const { response, json } = await requestJson('/settings/import', {
      method: 'POST',
      body: JSON.stringify({
        animes: [
          {
            id: 77,
            external_id: 999,
            source: 'Import',
            title: 'Maple Test',
            year: 2024,
            season: 'spring',
            type: 'tv',
            status: 'finished',
            episodes: 12,
            score: 8.2,
            genres: ['Comedy', 'Romance']
          },
          {
            id: 78,
            title: ''
          }
        ],
        userList: [
          {
            anime_id: 77,
            watch_status: 'completed',
            favorite: 1,
            user_score: 9,
            episodes_watched: 12,
            notes: 'Importado',
            started_at: null,
            completed_at: null
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    expect(json.message).toContain('Se importaron 1 animes y 1 elementos de lista');
    expect(saveAnimeToLocalMock).toHaveBeenCalledWith(expect.objectContaining({
      external_id: 999,
      title: 'Maple Test',
      genres: ['Comedy', 'Romance']
    }));
    expect(queryRunMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_list'), [
      1001,
      'completed',
      1,
      9,
      12,
      'Importado',
      null,
      null
    ]);
    expect(invalidateCachesMock).toHaveBeenCalledTimes(1);
  });
});
