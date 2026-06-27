import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRouter } from '../../src/routes/settingsRoutes';
import type { AISettings } from '../../src/chatbot/aiSettings';
import type { AppSettings } from '../../src/settings/appSettings';

const aiSettings: AISettings = {
  provider: 'ollama',
  model: 'llama3.2',
  url: 'http://localhost:11434',
  temperature: 0.1,
  contextLimit: 8192,
  maxTokens: 1000,
  enabled: false
};

const baseSettings: AppSettings = {
  theme: 'dark',
  language: 'es',
  closeBehavior: 'ask',
  translation: {
    enabled: true,
    autoStart: true,
    provider: 'libretranslate',
    url: 'http://localhost:5001',
    apiKey: '',
    timeoutMs: 5000,
    cacheEnabled: true,
    translateSynopsis: true,
    translateGenres: true,
    translateStatuses: true
  }
};

const getAISettingsMock = vi.fn<() => Promise<AISettings>>();
const setAISettingsMock = vi.fn<(settings: Partial<AISettings>) => Promise<void>>();
const resetAISettingsMock = vi.fn<() => Promise<void>>();
const seedInitialMemoryMock = vi.fn<() => Promise<void>>();
const buildUserSoulProfileMock = vi.fn<() => Promise<Record<string, unknown>>>();
const loadSettingsMock = vi.fn<() => AppSettings>();
const saveSettingsMock = vi.fn<(settings: AppSettings) => void>();
const normalizeTranslationSettingsMock = vi.fn();
const getLibreTranslateRuntimeStatusMock = vi.fn<() => Promise<Record<string, unknown>>>();
const httpGetMock = vi.fn();

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

describe('Settings HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(createSettingsRouter({
      aiSettingsService: {
        getAISettings: getAISettingsMock,
        setAISettings: setAISettingsMock,
        resetAISettings: resetAISettingsMock
      },
      assistantMemoryService: {
        seedInitialMemory: seedInitialMemoryMock,
        buildUserSoulProfile: buildUserSoulProfileMock
      },
      appSettingsStore: {
        loadSettings: loadSettingsMock,
        saveSettings: saveSettingsMock,
        normalizeTranslationSettingsForStorage: normalizeTranslationSettingsMock
      },
      translationRuntimeService: {
        getLibreTranslateRuntimeStatus: getLibreTranslateRuntimeStatusMock
      },
      httpClient: {
        get: httpGetMock
      }
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
    getAISettingsMock.mockResolvedValue(aiSettings);
    setAISettingsMock.mockResolvedValue();
    resetAISettingsMock.mockResolvedValue();
    seedInitialMemoryMock.mockResolvedValue();
    buildUserSoulProfileMock.mockResolvedValue({ genres: { action: 1 } });
    loadSettingsMock.mockReturnValue(baseSettings);
    saveSettingsMock.mockImplementation(() => undefined);
    normalizeTranslationSettingsMock.mockImplementation((raw, fallback) => ({
      ...fallback,
      ...raw,
      provider: 'libretranslate',
      url: String(raw?.url || fallback.url).replace(/\/+$/, '')
    }));
    getLibreTranslateRuntimeStatusMock.mockResolvedValue({
      state: 'running',
      url: 'http://localhost:5001'
    });
    httpGetMock.mockResolvedValue({
      data: {
        models: [{ name: 'llama3.2:latest' }]
      }
    });
  });

  it('expone y guarda ajustes de app manteniendo apariencia soportada', async () => {
    const loaded = await requestJson('/settings');
    expect(loaded.response.status).toBe(200);
    expect(loaded.json).toMatchObject({
      theme: 'dark',
      language: 'es',
      closeBehavior: 'ask'
    });

    const saved = await requestJson('/settings', {
      method: 'POST',
      body: JSON.stringify({
        theme: 'light',
        language: 'en',
        closeBehavior: 'minimize',
        translation: {
          url: 'http://localhost:5001/',
          translateGenres: false
        }
      })
    });

    expect(saved.response.status).toBe(200);
    expect(saveSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
      theme: 'dark',
      language: 'es',
      closeBehavior: 'minimize',
      translation: expect.objectContaining({
        url: 'http://localhost:5001',
        translateGenres: false
      })
    }));
  });

  it('rechaza URLs de traducción no locales antes de guardar', async () => {
    const { response, json } = await requestJson('/settings', {
      method: 'POST',
      body: JSON.stringify({
        translation: {
          url: 'file:///etc/passwd'
        }
      })
    });

    expect(response.status).toBe(400);
    expect(json.error).toBeTruthy();
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });

  it('mantiene el contrato de ajustes de IA y prueba de Ollama', async () => {
    const ai = await requestJson('/settings/ai');
    expect(ai.response.status).toBe(200);
    expect(ai.json).toMatchObject({
      provider: 'ollama',
      model: 'llama3.2'
    });

    const saved = await requestJson('/settings/ai', {
      method: 'POST',
      body: JSON.stringify({
        url: 'http://localhost:11434',
        enabled: true
      })
    });
    expect(saved.response.status).toBe(200);
    expect(setAISettingsMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true
    }));

    const tested = await requestJson('/settings/ai/test', {
      method: 'POST',
      body: JSON.stringify({
        url: 'http://localhost:11434',
        provider: 'ollama',
        model: 'llama3.2'
      })
    });
    expect(tested.response.status).toBe(200);
    expect(tested.json).toEqual({
      success: true,
      message: 'Conexión establecida correctamente.'
    });
    expect(httpGetMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      { timeout: 3000, maxRedirects: 0 }
    );
  });

  it('exige modelo instalado al probar Ollama', async () => {
    httpGetMock.mockResolvedValueOnce({
      data: {
        models: [{ name: 'otra-cosa:latest' }]
      }
    });

    const { response, json } = await requestJson('/settings/ai/test', {
      method: 'POST',
      body: JSON.stringify({
        url: 'http://localhost:11434',
        provider: 'ollama',
        model: 'llama3.2'
      })
    });

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.message).toContain('no se encontró el modelo');
  });

  it('restablece IA, genera memoria inicial y expone estado de traducción', async () => {
    const reset = await requestJson('/settings/ai', { method: 'DELETE' });
    expect(reset.response.status).toBe(200);
    expect(reset.json).toEqual({ success: true });
    expect(resetAISettingsMock).toHaveBeenCalledTimes(1);

    const seeded = await requestJson('/settings/ai/seed', {
      method: 'POST',
      body: '{}'
    });
    expect(seeded.response.status).toBe(200);
    expect(seedInitialMemoryMock).toHaveBeenCalledTimes(1);
    expect(seeded.json.profile).toEqual({ genres: { action: 1 } });

    const translation = await requestJson('/translation/status');
    expect(translation.response.status).toBe(200);
    expect(translation.json).toMatchObject({
      state: 'running',
      url: 'http://localhost:5001'
    });
  });
});
