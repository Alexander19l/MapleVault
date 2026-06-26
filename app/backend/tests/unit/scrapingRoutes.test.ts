import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScrapingRouter } from '../../src/routes/scrapingRoutes';
import type { NormalizedAnime } from '../../src/scraping/scraper';

const queryAllMock = vi.fn<(sql: string) => Promise<any[]>>();
const queryRunMock = vi.fn<(sql: string, params?: any[]) => Promise<{ lastID: number; changes: number }>>();
const syncSeasonMock = vi.fn<(year: number, season: string) => Promise<NormalizedAnime[]>>();
const saveAnimeToLocalMock = vi.fn<(anime: NormalizedAnime) => Promise<number>>();
const writeScrapingLogMock = vi.fn<(source: string, action: string, status: string, message: string) => Promise<void>>();
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

describe('Scraping HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(createScrapingRouter({
      queryClient: {
        all: queryAllMock,
        run: queryRunMock
      },
      syncSeason: syncSeasonMock,
      saveAnimeToLocal: saveAnimeToLocalMock,
      writeScrapingLog: writeScrapingLogMock,
      invalidateLibraryReadCaches: invalidateCachesMock,
      getCurrentYear: () => 2026
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
      if (sql.includes('scraping_logs')) {
        return [
          {
            id: 1,
            source: 'AniList',
            action: 'sync',
            status: 'success'
          }
        ];
      }

      if (sql.includes('sources')) {
        return [
          {
            id: 1,
            name: 'AniList',
            enabled: 1,
            rate_limit: 1000
          }
        ];
      }

      return [];
    });
    queryRunMock.mockResolvedValue({ lastID: 1, changes: 1 });
    syncSeasonMock.mockResolvedValue([
      {
        external_id: 100,
        source: 'AniList',
        title: 'Maple Season',
        year: 2026,
        season: 'winter',
        genres: ['Action']
      }
    ]);
    saveAnimeToLocalMock.mockResolvedValue(9001);
    writeScrapingLogMock.mockResolvedValue();
  });

  it('sincroniza una temporada y guarda cada anime normalizado', async () => {
    const { response, json } = await requestJson('/scraping/sync-season', {
      method: 'POST',
      body: JSON.stringify({
        year: 2026,
        season: 'winter'
      })
    });

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: 'Sincronización completada. Se añadieron o actualizaron 1 animes.',
      count: 1
    });
    expect(syncSeasonMock).toHaveBeenCalledWith(2026, 'winter');
    expect(saveAnimeToLocalMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Maple Season'
    }));
    expect(invalidateCachesMock).toHaveBeenCalledTimes(1);
  });

  it('valida parámetros de temporada y año masivo', async () => {
    const missingSeason = await requestJson('/scraping/sync-season', {
      method: 'POST',
      body: JSON.stringify({ year: 2026 })
    });
    expect(missingSeason.response.status).toBe(400);

    const invalidYear = await requestJson('/scraping/sync-years', {
      method: 'POST',
      body: JSON.stringify({ startYear: 1969 })
    });
    expect(invalidYear.response.status).toBe(400);
    expect(syncSeasonMock).not.toHaveBeenCalled();
  });

  it('inicia scraping masivo en segundo plano sin bloquear la respuesta', async () => {
    syncSeasonMock.mockResolvedValue([]);

    const { response, json } = await requestJson('/scraping/sync-years', {
      method: 'POST',
      body: JSON.stringify({ startYear: 2026 })
    });

    expect(response.status).toBe(200);
    expect(json.message).toContain('Scraping masivo iniciado en segundo plano desde el año 2026');

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writeScrapingLogMock).toHaveBeenCalledWith(
      'Massive Scraping',
      'Sincronización masiva desde 2026',
      'started',
      expect.any(String)
    );
  });

  it('expone logs y fuentes de scraping', async () => {
    const logs = await requestJson('/scraping/logs');
    const sources = await requestJson('/scraping/sources');

    expect(logs.response.status).toBe(200);
    expect(logs.json).toEqual([
      expect.objectContaining({
        source: 'AniList',
        status: 'success'
      })
    ]);
    expect(sources.response.status).toBe(200);
    expect(sources.json).toEqual([
      expect.objectContaining({
        name: 'AniList',
        rate_limit: 1000
      })
    ]);
  });

  it('actualiza fuentes validando id y rate limit', async () => {
    const invalid = await requestJson('/scraping/sources/1', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        rate_limit: 100
      })
    });
    expect(invalid.response.status).toBe(400);
    expect(queryRunMock).not.toHaveBeenCalled();

    const updated = await requestJson('/scraping/sources/1', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: false,
        rate_limit: 1200
      })
    });

    expect(updated.response.status).toBe(200);
    expect(updated.json.message).toBe('Fuente actualizada con éxito');
    expect(queryRunMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE sources'), [0, 1200, 1]);
  });
});
