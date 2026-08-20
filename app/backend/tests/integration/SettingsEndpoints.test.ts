import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { app } from '../../src/server';

let server: Server;
let baseUrl: string;

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  return { response, json: await response.json() };
}

describe('Settings HTTP endpoints', () => {
  it('acepta el origen loopback usado por Vite en desarrollo', async () => {
    const { response } = await requestJson('/settings', {
      headers: {
        Origin: 'http://127.0.0.1:5173'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  beforeAll(async () => {
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

  it('carga ajustes con valores predeterminados válidos', async () => {
    const { response, json } = await requestJson('/settings');

    expect(response.status).toBe(200);
    expect(json.theme).toBe('violet');
    expect(json.language).toBe('es');
    expect(['ask', 'minimize', 'quit']).toContain(json.closeBehavior);
    expect(json.translation).toEqual(expect.objectContaining({
      provider: 'libretranslate',
      cacheEnabled: expect.any(Boolean)
    }));
  });

  it('acepta un tema soportado y guarda cierre y traducción normalizada', async () => {
    const payload = {
      theme: 'light',
      language: 'es',
      closeBehavior: 'minimize',
      translation: {
        enabled: true,
        autoStart: true,
        url: 'http://localhost:5001/',
        apiKey: '',
        timeoutMs: 6200,
        cacheEnabled: true,
        translateSynopsis: true,
        translateGenres: false,
        translateStatuses: true
      }
    };

    const saved = await requestJson('/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(saved.response.status).toBe(200);

    const loaded = await requestJson('/settings');
    expect(loaded.json).toMatchObject({
      theme: 'violet',
      language: 'es',
      closeBehavior: 'minimize'
    });
    expect(loaded.json.translation).toMatchObject({
      url: 'http://localhost:5001',
      timeoutMs: 6200,
      translateGenres: false
    });
  });

  it('rechaza valores no permitidos conservando una configuración válida', async () => {
    await requestJson('/settings', {
      method: 'POST',
      body: JSON.stringify({
        theme: 'invalid-theme',
        language: 'invalid-language',
        closeBehavior: 'destroy',
        translation: {
          url: 'file:///etc/passwd',
          timeoutMs: 100
        }
      })
    });

    const loaded = await requestJson('/settings');
    expect(loaded.json.theme).toBe('violet');
    expect(loaded.json.language).toBe('es');
    expect(['ask', 'minimize', 'quit']).toContain(loaded.json.closeBehavior);
    expect(loaded.json.translation.url).toMatch(/^https?:\/\//);
    expect(loaded.json.translation.timeoutMs).toBeGreaterThanOrEqual(3000);
  });

  it('expone el estado del servicio de traducción sin bloquear Ajustes', async () => {
    const { response, json } = await requestJson('/translation/status');

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      state: expect.any(String)
    }));
  });
});
