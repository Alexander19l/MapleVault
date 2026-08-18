import { describe, expect, it, vi } from 'vitest';
import type { AppSettings, StoredTranslationSettings } from '../../src/settings/appSettings';
import {
  buildSavedAppSettings,
  getAIConnectivityEndpoint,
  hasOllamaModel,
  normalizeCloseBehavior
} from '../../src/routes/settingsRouteService';

const translationSettings: StoredTranslationSettings = {
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
};

const currentSettings: AppSettings = {
  theme: 'violet',
  language: 'es',
  closeBehavior: 'ask',
  translation: translationSettings
};

describe('settingsRouteService', () => {
  it('normaliza el comportamiento de cierre sin aceptar valores desconocidos', () => {
    expect(normalizeCloseBehavior('minimize', 'ask')).toBe('minimize');
    expect(normalizeCloseBehavior('quit', 'ask')).toBe('quit');
    expect(normalizeCloseBehavior('force-close', 'ask')).toBe('ask');
    expect(normalizeCloseBehavior(undefined, 'quit')).toBe('quit');
  });

  it('construye ajustes persistibles manteniendo apariencia soportada', () => {
    const normalizeTranslation = vi.fn((raw, fallback) => ({
      ...fallback,
      ...raw,
      provider: 'libretranslate'
    }));

    const settings = buildSavedAppSettings(
      currentSettings,
      {
        theme: 'light',
        language: 'en',
        closeBehavior: 'minimize',
        translation: {
          translateGenres: false
        }
      },
      normalizeTranslation
    );

    expect(settings).toMatchObject({
      theme: 'violet',
      language: 'es',
      closeBehavior: 'minimize',
      translation: {
        translateGenres: false
      }
    });
    expect(normalizeTranslation).toHaveBeenCalledWith(
      { translateGenres: false },
      translationSettings
    );
  });

  it('aplica un tema válido enviado desde Ajustes', () => {
    const normalizeTranslation = vi.fn((_raw, fallback) => fallback);

    const settings = buildSavedAppSettings(
      currentSettings,
      { theme: 'ember' },
      normalizeTranslation
    );

    expect(settings.theme).toBe('ember');
  });

  it('ignora un tema no soportado y conserva el valor actual', () => {
    const normalizeTranslation = vi.fn((_raw, fallback) => fallback);

    const settings = buildSavedAppSettings(
      { ...currentSettings, theme: 'ember' },
      { theme: 'not-a-real-theme' },
      normalizeTranslation
    );

    expect(settings.theme).toBe('ember');
  });

  it('resuelve endpoints de prueba segun proveedor', () => {
    expect(getAIConnectivityEndpoint('http://localhost:11434', 'ollama')).toBe(
      'http://localhost:11434/api/tags'
    );
    expect(getAIConnectivityEndpoint('http://localhost:1234', 'openai-compatible')).toBe(
      'http://localhost:1234/v1/models'
    );
  });

  it('detecta modelos exactos y variantes taggeadas de Ollama', () => {
    expect(hasOllamaModel({ models: [{ name: 'llama3.2:latest' }] }, 'llama3.2')).toBe(true);
    expect(hasOllamaModel({ models: [{ name: 'llama3.2' }] }, 'llama3.2')).toBe(true);
    expect(hasOllamaModel({ models: [{ name: 'mistral:latest' }] }, 'llama3.2')).toBe(false);
    expect(hasOllamaModel({}, 'llama3.2')).toBe(false);
  });
});
