import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DB_PATH, query } from '../database/db';
import { validateLocalServiceUrl } from '../security/validators';

export interface TranslationSettings {
  enabled: boolean;
  autoStart: boolean;
  provider: 'libretranslate';
  url: string;
  apiKey?: string;
  targetLanguage: 'es';
  timeoutMs: number;
  cacheEnabled: boolean;
  translateSynopsis: boolean;
  translateGenres: boolean;
  translateStatuses: boolean;
}

interface TranslationResult {
  text: string;
  translated: boolean;
  provider: string;
  cached: boolean;
  status: 'translated' | 'cached' | 'disabled' | 'empty' | 'spanish_source' | 'provider_unavailable' | 'error' | 'deferred';
}

const SETTINGS_PATH = path.join(path.dirname(DB_PATH), 'settings.json');
let libreTranslateUnavailableUntil = 0;

const GENRE_LABELS_ES: Record<string, string> = {
  action: 'Accion',
  adventure: 'Aventura',
  comedy: 'Comedia',
  drama: 'Drama',
  ecchi: 'Ecchi',
  fantasy: 'Fantasia',
  horror: 'Terror',
  mahou_shoujo: 'Chicas magicas',
  mecha: 'Mecha',
  music: 'Musica',
  mystery: 'Misterio',
  psychological: 'Psicologico',
  romance: 'Romance',
  sci_fi: 'Ciencia ficcion',
  'sci-fi': 'Ciencia ficcion',
  slice_of_life: 'Vida cotidiana',
  sports: 'Deportes',
  supernatural: 'Sobrenatural',
  thriller: 'Suspenso',
  award_winning: 'Premiada',
  boys_love: 'Boys love',
  girls_love: 'Girls love',
  gourmet: 'Gastronomia',
  suspense: 'Suspenso',
  hentai: 'Hentai',
  erotica: 'Erotica'
};

export const STATUS_LABELS_ES: Record<string, string> = {
  finished: 'Finalizado',
  airing: 'En emision',
  upcoming: 'Proximamente',
  cancelled: 'Cancelado',
  unknown: 'Desconocido',
  releasing: 'En emision',
  completed: 'Finalizado',
  not_yet_released: 'Proximamente',
  watching: 'Viendo',
  plan_to_watch: 'Pendiente',
  dropped: 'Abandonado'
};

export const TYPE_LABELS_ES: Record<string, string> = {
  tv: 'TV',
  movie: 'Pelicula',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Especial',
  unknown: 'Desconocido'
};

const DEFAULT_SETTINGS: TranslationSettings = {
  enabled: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
  autoStart: process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
  provider: 'libretranslate',
  url: process.env.LIBRETRANSLATE_URL || 'http://localhost:5001',
  apiKey: process.env.LIBRETRANSLATE_API_KEY || '',
  targetLanguage: 'es',
  timeoutMs: Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || 5000),
  cacheEnabled: true,
  translateSynopsis: true,
  translateGenres: true,
  translateStatuses: true
};

function normalizeTextKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sourceHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeLibreTranslateUrl(url: string): string {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_SETTINGS.url;
}

export function getLibreTranslateApiBaseUrl(url: string): string {
  const normalized = normalizeLibreTranslateUrl(url);
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return normalized;
  }
}

function isProbablySpanish(text: string): boolean {
  const normalized = ` ${text.toLowerCase()} `;
  const spanishSignals = [
    ' el ', ' la ', ' los ', ' las ', ' una ', ' uno ', ' que ', ' para ', ' con ', ' por ',
    ' despues ', ' mientras ', ' joven ', ' vida ', ' mundo ', ' serie ', ' capitulos ',
    'ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡'
  ];
  return spanishSignals.some(signal => normalized.includes(signal));
}

function getAnimeEntityKey(anime: Record<string, any>): string {
  if (anime.id) return `local:${anime.id}`;
  if (anime.source && anime.external_id) return `${String(anime.source).toLowerCase()}:${anime.external_id}`;
  const title = normalizeTextKey(String(anime.title || anime.title_romaji || anime.title_english || 'anime'));
  return `external:${title}:${anime.year || 'unknown'}`;
}

function normalizeTranslationSettings(raw: any): TranslationSettings {
  const rawTranslation = raw?.translation || {};
  const envEnabled = process.env.LIBRETRANSLATE_ENABLED;
  const envTimeout = Number(process.env.LIBRETRANSLATE_TIMEOUT_MS || '');
  const configuredUrl = process.env.LIBRETRANSLATE_URL || rawTranslation.url || DEFAULT_SETTINGS.url;
  const validatedUrl = validateLocalServiceUrl(configuredUrl);

  return {
    ...DEFAULT_SETTINGS,
    enabled: envEnabled === 'false'
      ? false
      : envEnabled === 'true'
        ? true
        : rawTranslation.enabled ?? DEFAULT_SETTINGS.enabled,
    autoStart: rawTranslation.autoStart ?? DEFAULT_SETTINGS.autoStart,
    provider: 'libretranslate',
    url: normalizeLibreTranslateUrl(validatedUrl.valid ? validatedUrl.url : DEFAULT_SETTINGS.url),
    apiKey: process.env.LIBRETRANSLATE_API_KEY || rawTranslation.apiKey || '',
    targetLanguage: 'es',
    timeoutMs: Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : Math.min(Math.max(Number(rawTranslation.timeoutMs || DEFAULT_SETTINGS.timeoutMs), 3000), 15000),
    cacheEnabled: rawTranslation.cacheEnabled ?? DEFAULT_SETTINGS.cacheEnabled,
    translateSynopsis: rawTranslation.translateSynopsis ?? DEFAULT_SETTINGS.translateSynopsis,
    translateGenres: rawTranslation.translateGenres ?? DEFAULT_SETTINGS.translateGenres,
    translateStatuses: rawTranslation.translateStatuses ?? DEFAULT_SETTINGS.translateStatuses
  };
}

export function getTranslationSettings(): TranslationSettings {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return normalizeTranslationSettings({});
    return normalizeTranslationSettings(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')));
  } catch (_) {
    return normalizeTranslationSettings({});
  }
}

export function translateGenreLabel(genre: string): string {
  const key = normalizeTextKey(genre);
  return GENRE_LABELS_ES[key] || genre;
}

export function translateStatusLabel(status: string | undefined): string | undefined {
  if (!status) return status;
  return STATUS_LABELS_ES[normalizeTextKey(status)] || status;
}

export function translateTypeLabel(type: string | undefined): string | undefined {
  if (!type) return type;
  return TYPE_LABELS_ES[normalizeTextKey(type)] || type;
}

export function getDisplayGenres(anime: Record<string, any>): string[] {
  if (Array.isArray(anime.genres_es) && anime.genres_es.length > 0) return anime.genres_es;
  return Array.isArray(anime.genres) ? anime.genres : [];
}

async function readCachedTranslation(
  entityKey: string,
  field: string,
  targetLanguage: string,
  hash: string
): Promise<string | null> {
  const cached = await query.get(`
    SELECT translated_text
    FROM anime_translations
    WHERE entity_key = ?
      AND field = ?
      AND target_language = ?
      AND source_hash = ?
      AND status = 'translated'
    LIMIT 1
  `, [entityKey, field, targetLanguage, hash]);

  return cached?.translated_text || null;
}

async function writeCachedTranslation(params: {
  animeId?: number | null;
  entityKey: string;
  field: string;
  targetLanguage: string;
  hash: string;
  sourceText: string;
  translatedText: string;
  provider: string;
}) {
  const localAnimeId = await resolveLocalAnimeId(params.animeId);
  await query.run(`
    INSERT INTO anime_translations (
      anime_id, entity_key, field, source_language, target_language,
      source_hash, source_text, translated_text, provider, status, updated_at
    ) VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, ?, 'translated', CURRENT_TIMESTAMP)
    ON CONFLICT(entity_key, field, target_language, source_hash)
    DO UPDATE SET
      translated_text = excluded.translated_text,
      provider = excluded.provider,
      status = 'translated',
      error_message = NULL,
      updated_at = CURRENT_TIMESTAMP
  `, [
    localAnimeId,
    params.entityKey,
    params.field,
    params.targetLanguage,
    params.hash,
    params.sourceText,
    params.translatedText,
    params.provider
  ]);
}

async function resolveLocalAnimeId(animeId?: number | null): Promise<number | null> {
  const normalizedId = Number(animeId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;

  const existing = await query.get('SELECT id FROM anime WHERE id = ? LIMIT 1', [normalizedId]);
  return existing?.id ? Number(existing.id) : null;
}

function isTimeoutError(err: any): boolean {
  const message = String(err?.message || '').toLowerCase();
  return err?.code === 'ECONNABORTED' || message.includes('timeout');
}

export async function translateTextForAnime(params: {
  animeId?: number | null;
  entityKey: string;
  field: string;
  text?: string | null;
  settings?: TranslationSettings;
}): Promise<TranslationResult> {
  const settings = params.settings || getTranslationSettings();
  const text = String(params.text || '').trim();

  if (!text) {
    return { text: '', translated: false, provider: settings.provider, cached: false, status: 'empty' };
  }

  if (!settings.enabled) {
    return { text, translated: false, provider: settings.provider, cached: false, status: 'disabled' };
  }

  if (params.field === 'synopsis' && !settings.translateSynopsis) {
    return { text, translated: false, provider: settings.provider, cached: false, status: 'disabled' };
  }

  if (text.length < 30 || isProbablySpanish(text)) {
    return { text, translated: false, provider: settings.provider, cached: false, status: 'spanish_source' };
  }

  const hash = sourceHash(text);

  if (settings.cacheEnabled) {
    const cached = await readCachedTranslation(params.entityKey, params.field, settings.targetLanguage, hash);
    if (cached) {
      return { text: cached, translated: true, provider: settings.provider, cached: true, status: 'cached' };
    }
  }

  if (Date.now() < libreTranslateUnavailableUntil) {
    return { text, translated: false, provider: settings.provider, cached: false, status: 'provider_unavailable' };
  }

  try {
    const payload: Record<string, any> = {
      q: text,
      source: 'auto',
      target: settings.targetLanguage,
      format: 'text'
    };

    if (settings.apiKey) {
      payload.api_key = settings.apiKey;
    }

    const response = await axios.post(`${getLibreTranslateApiBaseUrl(settings.url)}/translate`, payload, {
      timeout: Math.max(settings.timeoutMs, 5000),
      maxRedirects: 0,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MapleVault-Local-Client'
      }
    });

    const translatedText = String(response.data?.translatedText || '').trim();
    if (!translatedText) {
      return { text, translated: false, provider: settings.provider, cached: false, status: 'error' };
    }

    if (settings.cacheEnabled) {
      try {
        await writeCachedTranslation({
          animeId: params.animeId || null,
          entityKey: params.entityKey,
          field: params.field,
          targetLanguage: settings.targetLanguage,
          hash,
          sourceText: text,
          translatedText,
          provider: settings.provider
        });
      } catch (cacheErr: any) {
        console.warn(`[MapleVault] No se pudo cachear la traduccion: ${cacheErr.message}`);
      }
    }

    return { text: translatedText, translated: true, provider: settings.provider, cached: false, status: 'translated' };
  } catch (err: any) {
    if (!isTimeoutError(err)) {
      libreTranslateUnavailableUntil = Date.now() + 15 * 1000;
    }
    console.warn(`[MapleVault] LibreTranslate no disponible: ${err.message}`);
    return { text, translated: false, provider: settings.provider, cached: false, status: 'provider_unavailable' };
  }
}

export async function decorateAnimeWithSpanishTranslation<T extends Record<string, any>>(
  anime: T,
  settings = getTranslationSettings()
): Promise<T> {
  const entityKey = getAnimeEntityKey(anime);
  const originalSynopsis = String(anime.synopsis_original || anime.synopsis || '');
  const translation = await translateTextForAnime({
    animeId: anime.id ? Number(anime.id) : null,
    entityKey,
    field: 'synopsis',
    text: originalSynopsis,
    settings
  });

  const translatedGenres = Array.isArray(anime.genres)
    ? anime.genres.map((genre: string) => settings.translateGenres ? translateGenreLabel(genre) : genre)
    : [];

  return {
    ...anime,
    synopsis_original: originalSynopsis || anime.synopsis_original,
    synopsis_es: translation.text || originalSynopsis,
    synopsis: translation.text || originalSynopsis,
    genres_es: translatedGenres,
    status_label_es: settings.translateStatuses ? translateStatusLabel(anime.status) : anime.status,
    type_label_es: translateTypeLabel(anime.type),
    translation: {
      provider: translation.provider,
      synopsisStatus: translation.status,
      synopsisTranslated: translation.translated,
      synopsisCached: translation.cached
    }
  };
}

export async function decorateAnimeListWithSpanishTranslation<T extends Record<string, any>>(
  rows: T[],
  options: { maxRowsToTranslate?: number } = {}
): Promise<T[]> {
  const settings = getTranslationSettings();
  const maxRowsToTranslate = options.maxRowsToTranslate ?? 24;
  const output: T[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (index >= maxRowsToTranslate) {
      const genresEs = Array.isArray(row.genres)
        ? row.genres.map((genre: string) => settings.translateGenres ? translateGenreLabel(genre) : genre)
        : [];
      output.push({
        ...row,
        synopsis_original: row.synopsis_original || row.synopsis,
        synopsis_es: row.synopsis,
        genres_es: genresEs,
        status_label_es: settings.translateStatuses ? translateStatusLabel(row.status) : row.status,
        type_label_es: translateTypeLabel(row.type),
        translation: {
          provider: settings.provider,
          synopsisStatus: 'deferred',
          synopsisTranslated: false,
          synopsisCached: false
        }
      });
      continue;
    }

    output.push(await decorateAnimeWithSpanishTranslation(row, settings));
  }

  return output;
}
