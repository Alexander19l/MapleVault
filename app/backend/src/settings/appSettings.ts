import fs from 'fs';
import path from 'path';
import { DB_PATH } from '../database/db';
import { validateLocalServiceUrl } from '../security/validators';
import { enforceSupportedAppearance } from './settingsPolicy';

export interface StoredTranslationSettings {
  enabled: boolean;
  autoStart: boolean;
  provider: 'libretranslate';
  url: string;
  apiKey: string;
  timeoutMs: number;
  cacheEnabled: boolean;
  translateSynopsis: boolean;
  translateGenres: boolean;
  translateStatuses: boolean;
}

export interface AppSettings {
  theme: 'violet' | 'ember';
  language: 'es';
  closeBehavior: 'ask' | 'minimize' | 'quit';
  translation: StoredTranslationSettings;
}

const DATA_DIR = path.dirname(DB_PATH);
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

function ensureSettingsDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function defaultAppSettings(): AppSettings {
  return {
    theme: 'violet',
    language: 'es',
    closeBehavior: 'ask',
    translation: {
      enabled: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
      autoStart: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
      provider: 'libretranslate',
      url: process.env.LIBRETRANSLATE_URL || 'http://localhost:5001',
      apiKey: process.env.LIBRETRANSLATE_API_KEY || '',
      timeoutMs: Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || 5000),
      cacheEnabled: true,
      translateSynopsis: true,
      translateGenres: true,
      translateStatuses: true
    }
  };
}

export function normalizeTranslationSettingsForStorage(
  raw: Partial<StoredTranslationSettings> | undefined,
  fallback: StoredTranslationSettings
): StoredTranslationSettings {
  const candidateUrl = String(raw?.url || fallback?.url || 'http://localhost:5001').trim();
  const validatedUrl = validateLocalServiceUrl(candidateUrl);
  const fallbackUrl = validateLocalServiceUrl(fallback?.url || 'http://localhost:5001');
  const url = validatedUrl.valid ? validatedUrl.url : fallbackUrl.url || 'http://localhost:5001';

  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback?.enabled ?? true,
    autoStart: typeof raw?.autoStart === 'boolean' ? raw.autoStart : fallback?.autoStart ?? true,
    provider: 'libretranslate',
    url,
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey.slice(0, 500) : fallback?.apiKey || '',
    timeoutMs: Number.isFinite(Number(raw?.timeoutMs))
      ? Math.min(Math.max(Number(raw?.timeoutMs), 3000), 15000)
      : fallback?.timeoutMs || 5000,
    cacheEnabled: typeof raw?.cacheEnabled === 'boolean' ? raw.cacheEnabled : fallback?.cacheEnabled ?? true,
    translateSynopsis: typeof raw?.translateSynopsis === 'boolean'
      ? raw.translateSynopsis
      : fallback?.translateSynopsis ?? true,
    translateGenres: typeof raw?.translateGenres === 'boolean'
      ? raw.translateGenres
      : fallback?.translateGenres ?? true,
    translateStatuses: typeof raw?.translateStatuses === 'boolean'
      ? raw.translateStatuses
      : fallback?.translateStatuses ?? true
  };
}

export function loadSettings(): AppSettings {
  ensureSettingsDirectory();
  const defaults = defaultAppSettings();

  if (!fs.existsSync(SETTINGS_PATH)) {
    saveSettings(defaults);
    return defaults;
  }

  try {
    const stored = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const normalized = enforceSupportedAppearance({
      ...defaults,
      ...stored,
      translation: normalizeTranslationSettingsForStorage(stored.translation, defaults.translation)
    }) as AppSettings;

    if (stored.theme !== normalized.theme || stored.language !== normalized.language) {
      saveSettings(normalized);
    }

    return normalized;
  } catch (_) {
    saveSettings(defaults);
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  ensureSettingsDirectory();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}
