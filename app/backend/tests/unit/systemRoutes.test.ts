import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSystemRouter } from '../../src/routes/systemRoutes';
import type { AISettings } from '../../src/chatbot/aiSettings';

const queryGetMock = vi.fn<(sql: string, params?: unknown[]) => Promise<{ c: number } | undefined>>();
const queryAllMock = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
const listBackupsMock = vi.fn<() => { name: string; path: string; sizeBytes: number; createdAt: string }[]>();
const getAssistantSettingsMock = vi.fn<() => Promise<AISettings>>();

const databasePath = 'C:/MapleVault/data/database.sqlite';
const fixedUptime = 123.45;

let server: Server;
let baseUrl: string;

async function requestJson(requestPath: string) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  return {
    response,
    json: await response.json()
  };
}

describe('System HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(createSystemRouter({
      queryClient: {
        get: queryGetMock,
        all: queryAllMock
      },
      listDatabaseBackups: listBackupsMock,
      getAssistantSettings: getAssistantSettingsMock,
      databasePath,
      getUptime: () => fixedUptime
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
    queryGetMock.mockImplementation(async sql => {
      if (sql.includes('FROM anime')) return { c: 42 };
      if (sql.includes('FROM user_list')) return { c: 7 };
      return undefined;
    });
    queryAllMock.mockResolvedValue([
      {
        name: 'AniList',
        enabled: 1,
        rate_limit: 60,
        last_sync: '2026-06-25T20:00:00.000Z'
      }
    ]);
    listBackupsMock.mockReturnValue([
      {
        name: 'maplevault_backup.sqlite',
        path: 'C:/MapleVault/data/backups/maplevault_backup.sqlite',
        sizeBytes: 4096,
        createdAt: '2026-06-25T20:30:00.000Z'
      }
    ]);
    getAssistantSettingsMock.mockResolvedValue({
      provider: 'ollama',
      model: 'llama3.2',
      url: 'http://localhost:11434',
      temperature: 0.1,
      contextLimit: 8192,
      maxTokens: 1000,
      enabled: false
    });
  });

  it('mantiene el contrato de /system/health', async () => {
    const { response, json } = await requestJson('/system/health');

    expect(response.status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      database: {
        connected: true,
        animeCount: 42,
        userListCount: 7,
        dbPath: databasePath
      },
      backup: {
        count: 1,
        latest: '2026-06-25T20:30:00.000Z'
      },
      uptime: fixedUptime
    });
  });

  it('mantiene el contrato de /system/diagnostics', async () => {
    const { response, json } = await requestJson('/system/diagnostics');

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      app: 'MapleVault',
      status: 'ok',
      database: {
        connected: true,
        path: databasePath,
        animeCount: 42,
        userListCount: 7
      },
      assistant: {
        provider: 'ollama',
        model: 'llama3.2',
        enabled: false,
        url: 'http://localhost:11434'
      },
      backup: {
        count: 1,
        latest: '2026-06-25T20:30:00.000Z'
      },
      uptime: fixedUptime
    });
    expect(json.scraping.sources).toEqual([
      expect.objectContaining({
        name: 'AniList',
        rate_limit: 60
      })
    ]);
  });

  it('expone el inventario de subagentes de desarrollo', async () => {
    const { response, json } = await requestJson('/system/agents');

    expect(response.status).toBe(200);
    expect(json.product).toBe('MapleVault');
    expect(json.tokenReductionPolicy.length).toBeGreaterThan(0);
    expect(json.subagents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'security-reviewer' }),
        expect.objectContaining({ id: 'scraping-analyst' }),
        expect.objectContaining({ id: 'manga-planner' })
      ])
    );
  });

  it('expone fuentes candidatas desactivadas por defecto', async () => {
    const { response, json } = await requestJson('/system/source-candidates');

    expect(response.status).toBe(200);
    expect(json.policy).toContain('desactivados por defecto');
    expect(json.playerCapabilities).toMatchObject({
      httpsEmbed: 'supported',
      torrent: 'unsupported'
    });
    expect(json.selected).toHaveLength(4);
    expect(json.selected.filter((source: any) => source.languages.includes('en'))).toHaveLength(2);
    expect(json.selected.every((source: any) => source.enabledByDefault === false)).toBe(true);
    expect(json.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'anilist', risk: 'low', enabledByDefault: false }),
        expect.objectContaining({ id: 'mangadex', enabledByDefault: false })
      ])
    );
  });
  it('convierte fallos de lectura en respuesta 500 sin filtrar stack traces', async () => {
    queryGetMock.mockRejectedValueOnce(new Error('fallo de sqlite'));

    const { response, json } = await requestJson('/system/health');

    expect(response.status).toBe(500);
    expect(json).toEqual({
      status: 'error',
      error: 'fallo de sqlite'
    });
  });
});
