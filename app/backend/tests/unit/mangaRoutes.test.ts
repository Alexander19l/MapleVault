import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMangaRouter } from '../../src/routes/mangaRoutes';

const queryGetMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();
const queryAllMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any[]>>();

let server: Server;
let baseUrl: string;

async function requestJson(requestPath: string) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  return {
    response,
    json: await response.json()
  };
}

describe('Manga HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(createMangaRouter({
      queryClient: {
        get: queryGetMock,
        all: queryAllMock
      },
      sourceCandidatesProvider: () => [
        {
          id: 'mangadex',
          name: 'MangaDex API',
          url: 'https://api.mangadex.org',
          content: 'manga',
          languages: ['multi'],
          use: ['metadata', 'manga-provider'],
          risk: 'medium',
          enabledByDefault: false,
          notes: 'Candidato auditado antes de activarse.'
        }
      ] as any
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
    queryAllMock.mockResolvedValue([]);
    queryGetMock.mockResolvedValue({ total: 0 });
  });

  it('devuelve una lista vacia paginada sin activar scraping', async () => {
    const { response, json } = await requestJson('/manga?withTotal=true&limit=24&offset=0');

    expect(response.status).toBe(200);
    expect(json).toEqual({
      rows: [],
      total: 0,
      limit: 24,
      offset: 0
    });
    expect(queryAllMock.mock.calls[0][0]).toContain('FROM manga m');
  });

  it('expone fuentes candidatas de manga como desactivadas por defecto', async () => {
    queryAllMock.mockResolvedValueOnce([
      {
        id: 1,
        name: 'AniList Manga',
        base_url: 'https://graphql.anilist.co',
        language: 'multi',
        type: 'metadata',
        enabled: 0,
        risk_level: 'low',
        rate_limit: 1000,
        last_sync: null
      }
    ]);

    const { response, json } = await requestJson('/manga/sources');

    expect(response.status).toBe(200);
    expect(json.configured[0]).toMatchObject({
      name: 'AniList Manga',
      enabled: 0
    });
    expect(json.candidates[0]).toMatchObject({
      id: 'mangadex',
      enabledByDefault: false
    });
  });

  it('devuelve 404 cuando el manga no existe', async () => {
    queryGetMock.mockResolvedValueOnce(null);

    const { response, json } = await requestJson('/manga/44');

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: 'Manga no encontrado.' });
  });
});
