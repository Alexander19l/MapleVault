import { query, DB_PATH } from '../database/db';
import fs from 'fs';
import path from 'path';

const LAST_SEARCH_TTL_MS = 30 * 60 * 1000;
const RECENT_RECOMMENDATIONS_TTL_MS = 6 * 60 * 60 * 1000;
const CATALOG_CURSOR_TTL_MS = 30 * 60 * 1000;
const PAGED_RESULTS_TTL_MS = 30 * 60 * 1000;
const REMOTE_SEARCH_CURSOR_TTL_MS = 30 * 60 * 1000;

export interface CatalogCursor {
  createdAt: string;
  offset: number;
  pageSize: number;
  total: number;
  filters: {
    status?: string;
    genres: string[];
  };
}

export type PagedResultMode = 'pending' | 'completed' | 'search' | 'recommendation' | 'similar';

export interface PagedResultsCursor {
  createdAt: string;
  mode: PagedResultMode;
  label: string;
  offset: number;
  pageSize: number;
  total: number;
  items: any[];
  nextPrompt: string;
}

export interface RemoteSearchCursor {
  createdAt: string;
  query: string;
  label: string;
  provider: 'anilist' | 'jikan';
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  nextPrompt: string;
}

export interface AnimeFeedbackMemoryItem {
  id?: number;
  external_id?: number;
  source?: string;
  title: string;
  titleKey: string;
  createdAt: string;
}

export interface UserSoulProfile {
  generatedAt: string;
  librarySize: number;
  trackedSeries: number;
  favoriteGenres: string[];
  dislikedGenres: string[];
  favoriteStudios: string[];
  dislikedStudios: string[];
  favoriteFormats: string[];
  dislikedFormats: string[];
  favoriteToneTags: string[];
  dislikedToneTags: string[];
  preferredEpisodeLength: string;
  dislikedEpisodeLengths: string[];
  likedAnime: AnimeFeedbackMemoryItem[];
  dislikedAnime: AnimeFeedbackMemoryItem[];
  inferredGenres: Array<{
    genre: string;
    total: number;
    completed: number;
    favorites: number;
    dropped: number;
    averageUserScore: number;
    weight: number;
  }>;
  topStudios: Array<{ studio: string; total: number; averageUserScore: number }>;
  frequentFormats: Array<{ type: string; total: number }>;
  statusDistribution: Record<string, number>;
  recommendationHints: string[];
  trace: string[];
}

export interface PreferredEraMemory {
  year_from: number;
  year_to: number;
  weight: number;
  updatedAt: string;
}

export async function setAssistantMemory(key: string, value: any, category: string = 'general', source: string = 'system', confidence: number = 100): Promise<void> {
  const jsonValue = JSON.stringify(value);
  await query.run(`
    INSERT INTO assistant_memory (key, value, category, source, confidence, updated_at) 
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET 
      value = excluded.value,
      category = excluded.category,
      source = excluded.source,
      confidence = excluded.confidence,
      updated_at = CURRENT_TIMESTAMP
  `, [key, jsonValue, category, source, confidence]);
}

export async function getAssistantMemory<T>(key: string): Promise<T | null> {
  const row = await query.get('SELECT value FROM assistant_memory WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

// Fallbacks para compatibilidad
export const setMemory = setAssistantMemory;
export const getMemory = getAssistantMemory;

export async function clearAllMemory(): Promise<void> {
  await query.run('DELETE FROM assistant_memory');
  const soulPath = getSoulPath();
  if (fs.existsSync(soulPath)) {
    fs.rmSync(soulPath, { force: true });
  }
}

// =======================
// Utilidades de Contexto
// =======================

function normalizeMemoryValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeAnimeTitleKey(value: string): string {
  return normalizeMemoryValue(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

async function addMemoryListValue(key: string, value: string): Promise<void> {
  const current = await getMemory<string[]>(key) || [];
  const normalized = normalizeMemoryValue(value);
  if (normalized && !current.includes(normalized)) {
    current.push(normalized);
    await setAssistantMemory(key, current, 'preferences', 'user_interaction', 100);
  }
}

async function addMemoryListValues(key: string, values: string[]): Promise<void> {
  const current = await getMemory<string[]>(key) || [];
  let changed = false;

  for (const value of values) {
    const normalized = normalizeMemoryValue(value);
    if (normalized && !current.includes(normalized)) {
      current.push(normalized);
      changed = true;
    }
  }

  if (changed) {
    await setAssistantMemory(key, current, 'preferences', 'user_interaction', 100);
  }
}

async function removeMemoryListValues(key: string, values: string[]): Promise<void> {
  const current = await getMemory<string[]>(key) || [];
  const blocked = new Set(values.map(normalizeMemoryValue).filter(Boolean));
  const next = current.filter(value => !blocked.has(normalizeMemoryValue(value)));
  if (next.length !== current.length) {
    await setAssistantMemory(key, next, 'preferences', 'user_interaction', 100);
  }
}

function splitMemoryGenres(value: string): string[] {
  return String(value || '')
    .split(',')
    .map(genre => genre.trim())
    .filter(Boolean);
}

export async function addFavoriteGenre(genre: string): Promise<void> {
  const genres = splitMemoryGenres(genre);
  await removeMemoryListValues('disliked_genres', genres);
  await addMemoryListValues('favorite_genres', genres);
}

export async function addDislikedGenre(genre: string): Promise<void> {
  const genres = splitMemoryGenres(genre);
  await removeMemoryListValues('favorite_genres', genres);
  await addMemoryListValues('disliked_genres', genres);
}

export async function addFavoriteStudio(studio: string): Promise<void> {
  await removeMemoryListValues('disliked_studios', [studio]);
  await addMemoryListValue('favorite_studios', studio);
}

export async function addDislikedStudio(studio: string): Promise<void> {
  await removeMemoryListValues('favorite_studios', [studio]);
  await addMemoryListValue('disliked_studios', studio);
}

export async function addFavoriteFormat(format: string): Promise<void> {
  await removeMemoryListValues('disliked_formats', [format]);
  await addMemoryListValue('favorite_formats', format);
}

export async function addDislikedFormat(format: string): Promise<void> {
  await removeMemoryListValues('favorite_formats', [format]);
  await addMemoryListValue('disliked_formats', format);
}

export async function addFavoriteToneTag(tag: string): Promise<void> {
  await removeMemoryListValues('disliked_tone_tags', [tag]);
  await addMemoryListValue('favorite_tone_tags', tag);
}

export async function addDislikedToneTag(tag: string): Promise<void> {
  await removeMemoryListValues('favorite_tone_tags', [tag]);
  await addMemoryListValue('disliked_tone_tags', tag);
}

export async function setPreferredEpisodeLength(length: string): Promise<void> {
  await setAssistantMemory('preferred_episode_length', normalizeMemoryValue(length), 'preferences', 'user_interaction', 100);
}

export async function addDislikedEpisodeLength(length: string): Promise<void> {
  await addMemoryListValue('disliked_episode_lengths', length);
}

export async function setPreferredEraPreference(yearFrom: number, yearTo: number, weight = 1): Promise<void> {
  if (!Number.isInteger(yearFrom) || !Number.isInteger(yearTo) || yearFrom > yearTo) return;

  const key = `${Math.floor(yearFrom / 10) * 10}s`;
  const current = await getMemory<Record<string, PreferredEraMemory>>('preferred_eras') || {};
  current[key] = {
    year_from: yearFrom,
    year_to: yearTo,
    weight,
    updatedAt: new Date().toISOString()
  };

  await setAssistantMemory('preferred_eras', current, 'preferences', 'user_interaction', 100);
}

function toAnimeFeedbackMemoryItem(anime: any): AnimeFeedbackMemoryItem | null {
  const title = String(anime?.title || anime?.title_romaji || anime?.title_english || '').trim();
  const titleKey = normalizeAnimeTitleKey(title);
  if (!title || !titleKey) return null;

  return {
    ...(anime.id ? { id: Number(anime.id) } : {}),
    ...(anime.external_id ? { external_id: Number(anime.external_id) } : {}),
    ...(anime.source ? { source: String(anime.source) } : {}),
    title,
    titleKey,
    createdAt: new Date().toISOString()
  };
}

async function addAnimeFeedbackValue(key: string, anime: any): Promise<AnimeFeedbackMemoryItem | null> {
  const item = toAnimeFeedbackMemoryItem(anime);
  if (!item) return null;

  const current = await getMemory<AnimeFeedbackMemoryItem[]>(key) || [];
  const exists = current.some(existing => {
    const sameLocalId = item.id && existing.id === item.id;
    const sameExternalId = item.external_id && existing.external_id === item.external_id && existing.source === item.source;
    const sameTitle = existing.titleKey === item.titleKey;
    return sameLocalId || sameExternalId || sameTitle;
  });

  if (!exists) {
    current.unshift(item);
    await setAssistantMemory(key, current.slice(0, 100), 'preferences', 'user_interaction', 100);
  }

  return item;
}

async function removeAnimeFeedbackValue(key: string, anime: any): Promise<void> {
  const item = toAnimeFeedbackMemoryItem(anime);
  if (!item) return;
  const current = await getMemory<AnimeFeedbackMemoryItem[]>(key) || [];
  const next = current.filter(existing => {
    const sameLocalId = item.id && existing.id === item.id;
    const sameExternalId = item.external_id && existing.external_id === item.external_id && existing.source === item.source;
    const sameTitle = existing.titleKey === item.titleKey;
    return !(sameLocalId || sameExternalId || sameTitle);
  });
  if (next.length !== current.length) {
    await setAssistantMemory(key, next, 'preferences', 'user_interaction', 100);
  }
}

export async function addLikedAnimeFeedback(anime: any): Promise<AnimeFeedbackMemoryItem | null> {
  await removeAnimeFeedbackValue('disliked_anime', anime);
  return addAnimeFeedbackValue('liked_anime', anime);
}

export async function addDislikedAnimeFeedback(anime: any): Promise<AnimeFeedbackMemoryItem | null> {
  await removeAnimeFeedbackValue('liked_anime', anime);
  return addAnimeFeedbackValue('disliked_anime', anime);
}

export async function getFavoriteGenres(): Promise<string[]> {
  return await getMemory<string[]>('favorite_genres') || [];
}

export async function getRecommendationMemoryPreferences() {
  const [
    favoriteGenres,
    dislikedGenres,
    favoriteStudios,
    dislikedStudios,
    favoriteFormats,
    dislikedFormats,
    favoriteToneTags,
    dislikedToneTags,
    preferredEpisodeLength,
    dislikedEpisodeLengths,
    preferredEras,
    likedAnime,
    dislikedAnime
  ] = await Promise.all([
    getMemory<string[]>('favorite_genres'),
    getMemory<string[]>('disliked_genres'),
    getMemory<string[]>('favorite_studios'),
    getMemory<string[]>('disliked_studios'),
    getMemory<string[]>('favorite_formats'),
    getMemory<string[]>('disliked_formats'),
    getMemory<string[]>('favorite_tone_tags'),
    getMemory<string[]>('disliked_tone_tags'),
    getMemory<string>('preferred_episode_length'),
    getMemory<string[]>('disliked_episode_lengths'),
    getMemory<Record<string, PreferredEraMemory>>('preferred_eras'),
    getMemory<AnimeFeedbackMemoryItem[]>('liked_anime'),
    getMemory<AnimeFeedbackMemoryItem[]>('disliked_anime')
  ]);

  return {
    favoriteGenres: favoriteGenres || [],
    dislikedGenres: dislikedGenres || [],
    favoriteStudios: favoriteStudios || [],
    dislikedStudios: dislikedStudios || [],
    favoriteFormats: favoriteFormats || [],
    dislikedFormats: dislikedFormats || [],
    favoriteToneTags: favoriteToneTags || [],
    dislikedToneTags: dislikedToneTags || [],
    preferredEpisodeLength: preferredEpisodeLength || 'desconocido',
    dislikedEpisodeLengths: dislikedEpisodeLengths || [],
    preferredEras: preferredEras || {},
    likedAnime: likedAnime || [],
    dislikedAnime: dislikedAnime || []
  };
}

export async function setLastSearchContext(animes: any[]): Promise<void> {
  await setAssistantMemory('last_search_results', {
    createdAt: new Date().toISOString(),
    items: animes.slice(0, 10)
  }, 'context', 'system', 100);
}

export async function getLastSearchContext(): Promise<any[]> {
  const value = await getMemory<any[] | { createdAt?: string; items?: any[] }>('last_search_results');
  if (!value) return [];

  if (Array.isArray(value)) {
    return value;
  }

  const createdAt = value.createdAt ? new Date(value.createdAt).getTime() : 0;
  if (!createdAt || Date.now() - createdAt > LAST_SEARCH_TTL_MS) {
    await setAssistantMemory('last_search_results', { createdAt: null, items: [] }, 'context', 'system', 100);
    return [];
  }

  return Array.isArray(value.items) ? value.items : [];
}

export async function setCatalogCursor(cursor: Omit<CatalogCursor, 'createdAt'>): Promise<void> {
  await setAssistantMemory('catalog_cursor', {
    ...cursor,
    createdAt: new Date().toISOString()
  }, 'context', 'system', 100);
}

export async function getCatalogCursor(): Promise<CatalogCursor | null> {
  const cursor = await getMemory<CatalogCursor>('catalog_cursor');
  if (!cursor?.createdAt) return null;

  const createdAt = new Date(cursor.createdAt).getTime();
  if (!createdAt || Date.now() - createdAt > CATALOG_CURSOR_TTL_MS) {
    await setAssistantMemory('catalog_cursor', null, 'context', 'system', 100);
    return null;
  }

  return cursor;
}

export async function clearCatalogCursor(): Promise<void> {
  await setAssistantMemory('catalog_cursor', null, 'context', 'system', 100);
}

export async function setPagedResultsCursor(
  cursor: Omit<PagedResultsCursor, 'createdAt' | 'items'> & { items: any[] }
): Promise<void> {
  await setAssistantMemory('paged_results_cursor', {
    ...cursor,
    items: cursor.items.slice(0, 32),
    createdAt: new Date().toISOString()
  }, 'context', 'system', 100);
}

export async function getPagedResultsCursor(): Promise<PagedResultsCursor | null> {
  const cursor = await getMemory<PagedResultsCursor>('paged_results_cursor');
  if (!cursor?.createdAt || !Array.isArray(cursor.items)) return null;

  const createdAt = new Date(cursor.createdAt).getTime();
  if (!createdAt || Date.now() - createdAt > PAGED_RESULTS_TTL_MS) {
    await setAssistantMemory('paged_results_cursor', null, 'context', 'system', 100);
    return null;
  }

  return cursor;
}

export async function clearPagedResultsCursor(): Promise<void> {
  await setAssistantMemory('paged_results_cursor', null, 'context', 'system', 100);
}

export async function setRemoteSearchCursor(
  cursor: Omit<RemoteSearchCursor, 'createdAt'>
): Promise<void> {
  await setAssistantMemory('remote_search_cursor', {
    ...cursor,
    createdAt: new Date().toISOString()
  }, 'context', 'system', 100);
}

export async function getRemoteSearchCursor(): Promise<RemoteSearchCursor | null> {
  const cursor = await getMemory<RemoteSearchCursor>('remote_search_cursor');
  if (!cursor?.createdAt) return null;

  const createdAt = new Date(cursor.createdAt).getTime();
  if (!createdAt || Date.now() - createdAt > REMOTE_SEARCH_CURSOR_TTL_MS) {
    await setAssistantMemory('remote_search_cursor', null, 'context', 'system', 100);
    return null;
  }

  return cursor;
}

export async function clearRemoteSearchCursor(): Promise<void> {
  await setAssistantMemory('remote_search_cursor', null, 'context', 'system', 100);
}

export async function getRecentRecommendedAnime(): Promise<AnimeFeedbackMemoryItem[]> {
  const value = await getMemory<AnimeFeedbackMemoryItem[] | { createdAt?: string; items?: AnimeFeedbackMemoryItem[] }>('recent_recommendations');
  if (!value) return [];

  const items = Array.isArray(value) ? value : (Array.isArray(value.items) ? value.items : []);
  const freshItems = items.filter(item => {
    const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : 0;
    return Boolean(createdAt && Date.now() - createdAt <= RECENT_RECOMMENDATIONS_TTL_MS);
  });

  if (freshItems.length !== items.length) {
    await setAssistantMemory('recent_recommendations', {
      createdAt: new Date().toISOString(),
      items: freshItems
    }, 'context', 'system', 90);
  }

  return freshItems;
}

export async function rememberRecommendedAnime(animes: any[]): Promise<void> {
  const nextItems = animes
    .map(anime => toAnimeFeedbackMemoryItem(anime))
    .filter(Boolean) as AnimeFeedbackMemoryItem[];

  if (nextItems.length === 0) return;

  const current = await getRecentRecommendedAnime();
  const byTitle = new Map<string, AnimeFeedbackMemoryItem>();

  for (const item of [...nextItems, ...current]) {
    if (!item.titleKey || byTitle.has(item.titleKey)) continue;
    byTitle.set(item.titleKey, item);
  }

  await setAssistantMemory('recent_recommendations', {
    createdAt: new Date().toISOString(),
    items: Array.from(byTitle.values()).slice(0, 50)
  }, 'context', 'system', 90);
}

export async function rememberIntentRun(intent: string, entities: any): Promise<void> {
  const history = await getMemory<any[]>('recent_intents') || [];
  history.unshift({
    intent,
    entities,
    createdAt: new Date().toISOString()
  });
  await setAssistantMemory('recent_intents', history.slice(0, 25), 'analytics', 'system', 80);
}

export async function seedInitialMemory(): Promise<void> {
  await setAssistantMemory('preferred_language', 'español', 'config', 'seed', 100);
  await setAssistantMemory('response_style', 'claro, breve y útil', 'config', 'seed', 100);
  await setAssistantMemory('anime_preference_status', 'desconocido', 'preferences', 'seed', 50);
  await setAssistantMemory('favorite_genres', [], 'preferences', 'seed', 100);
  await setAssistantMemory('disliked_genres', [], 'preferences', 'seed', 100);
  await setAssistantMemory('favorite_studios', [], 'preferences', 'seed', 100);
  await setAssistantMemory('disliked_studios', [], 'preferences', 'seed', 100);
  await setAssistantMemory('favorite_formats', [], 'preferences', 'seed', 100);
  await setAssistantMemory('disliked_formats', [], 'preferences', 'seed', 100);
  await setAssistantMemory('favorite_tone_tags', [], 'preferences', 'seed', 100);
  await setAssistantMemory('disliked_tone_tags', [], 'preferences', 'seed', 100);
  await setAssistantMemory('disliked_episode_lengths', [], 'preferences', 'seed', 100);
  await setAssistantMemory('liked_anime', [], 'preferences', 'seed', 100);
  await setAssistantMemory('disliked_anime', [], 'preferences', 'seed', 100);
  await setAssistantMemory('preferred_anime_type', 'desconocido', 'preferences', 'seed', 50);
  await setAssistantMemory('preferred_episode_length', 'desconocido', 'preferences', 'seed', 50);
  await setAssistantMemory('preferred_eras', {}, 'preferences', 'seed', 100);
  await setAssistantMemory('preferred_sources', [], 'preferences', 'seed', 100);
  await setAssistantMemory('recommendation_mode', 'equilibrado', 'config', 'seed', 100);
  await setAssistantMemory('confirm_before_changes', true, 'security', 'seed', 100);
  await setAssistantMemory('use_local_data_first', true, 'config', 'seed', 100);
  
  const instructions = [
    "Eres Maple Assistant, un experto en anime.",
    "Utilizas exclusivamente Llama 3.2 local.",
    "Tus respuestas deben ser precisas y ayudar al usuario a gestionar su biblioteca.",
    "Nunca inventes información que no esté en la base de datos local."
  ];
  await setAssistantMemory('system_instructions', instructions, 'system', 'seed', 100);
}

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSoulPath(): string {
  const dbPath = DB_PATH || path.join(process.cwd(), 'data', 'maplevault.sqlite');
  return path.join(path.dirname(dbPath), 'user_soul.json');
}

export async function buildUserSoulProfile(): Promise<UserSoulProfile> {
  const [libraryCount, trackedCount, genreRows, studioRows, typeRows, statusRows] = await Promise.all([
    query.get('SELECT COUNT(*) as count FROM anime'),
    query.get('SELECT COUNT(*) as count FROM user_list'),
    query.all(`
      SELECT
        g.name as genre,
        COUNT(DISTINCT a.id) as total,
        SUM(CASE WHEN ul.watch_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN ul.favorite = 1 THEN 1 ELSE 0 END) as favorites,
        SUM(CASE WHEN ul.watch_status = 'dropped' THEN 1 ELSE 0 END) as dropped,
        AVG(CASE WHEN ul.user_score > 0 THEN ul.user_score ELSE NULL END) as averageUserScore
      FROM anime a
      JOIN anime_genres ag ON a.id = ag.anime_id
      JOIN genres g ON ag.genre_id = g.id
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      GROUP BY g.name
      ORDER BY total DESC, averageUserScore DESC
      LIMIT 25
    `),
    query.all(`
      SELECT
        COALESCE(NULLIF(a.studio, ''), 'Desconocido') as studio,
        COUNT(*) as total,
        AVG(CASE WHEN ul.user_score > 0 THEN ul.user_score ELSE NULL END) as averageUserScore
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      GROUP BY studio
      ORDER BY total DESC, averageUserScore DESC
      LIMIT 10
    `),
    query.all(`
      SELECT COALESCE(NULLIF(type, ''), 'unknown') as type, COUNT(*) as total
      FROM anime
      GROUP BY type
      ORDER BY total DESC
      LIMIT 10
    `),
    query.all(`
      SELECT COALESCE(watch_status, 'catalog_only') as status, COUNT(*) as total
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      GROUP BY status
    `)
  ]);

  const preferenceMemory = await getRecommendationMemoryPreferences();
  const {
    favoriteGenres,
    dislikedGenres,
    favoriteStudios,
    dislikedStudios,
    favoriteFormats,
    dislikedFormats,
    favoriteToneTags,
    dislikedToneTags,
    preferredEpisodeLength,
    dislikedEpisodeLengths,
    likedAnime,
    dislikedAnime
  } = preferenceMemory;

  const inferredGenres = genreRows.map((row: any) => {
    const total = toNumber(row.total);
    const completed = toNumber(row.completed);
    const favorites = toNumber(row.favorites);
    const dropped = toNumber(row.dropped);
    const averageUserScore = Math.round(toNumber(row.averageUserScore) * 10) / 10;
    const explicitFavoriteBonus = favoriteGenres.includes(String(row.genre).toLowerCase()) ? 20 : 0;
    const dislikedPenalty = dislikedGenres.includes(String(row.genre).toLowerCase()) ? 30 : 0;
    const weight = Math.round((total * 2 + completed * 5 + favorites * 8 + averageUserScore * 3 + explicitFavoriteBonus - dropped * 4 - dislikedPenalty) * 10) / 10;
    return {
      genre: String(row.genre),
      total,
      completed,
      favorites,
      dropped,
      averageUserScore,
      weight
    };
  }).sort((a, b) => b.weight - a.weight);

  const topStudios = studioRows.map((row: any) => ({
    studio: String(row.studio),
    total: toNumber(row.total),
    averageUserScore: Math.round(toNumber(row.averageUserScore) * 10) / 10
  }));

  const frequentFormats = typeRows.map((row: any) => ({
    type: String(row.type),
    total: toNumber(row.total)
  }));

  const statusDistribution = statusRows.reduce((acc: Record<string, number>, row: any) => {
    acc[String(row.status)] = toNumber(row.total);
    return acc;
  }, {});

  const recommendationHints = [
    ...inferredGenres.slice(0, 5).map(item => `Priorizar género ${item.genre} por peso ${item.weight}`),
    ...favoriteStudios.slice(0, 3).map(studio => `Priorizar estudio ${studio} por preferencia explicita`),
    ...favoriteFormats.slice(0, 2).map(format => `Priorizar formato ${format} por preferencia explicita`),
    ...favoriteToneTags.slice(0, 3).map(tag => `Priorizar tono ${tag} por preferencia explicita`),
    ...topStudios.slice(0, 3).map(item => `Considerar estudio ${item.studio} por presencia en biblioteca`),
    ...frequentFormats.slice(0, 2).map(item => `Formato frecuente: ${item.type}`)
  ];

  const trace = [
    `Catálogo total: ${toNumber(libraryCount?.count)} series.`,
    `Series en lista personal: ${toNumber(trackedCount?.count)}.`,
    favoriteGenres.length > 0 ? `Géneros favoritos explícitos: ${favoriteGenres.join(', ')}.` : 'No hay géneros favoritos explícitos.',
    dislikedGenres.length > 0 ? `Géneros rechazados explícitos: ${dislikedGenres.join(', ')}.` : 'No hay géneros rechazados explícitos.',
    favoriteStudios.length > 0 ? `Estudios favoritos explicitos: ${favoriteStudios.join(', ')}.` : 'No hay estudios favoritos explicitos.',
    dislikedStudios.length > 0 ? `Estudios rechazados explicitos: ${dislikedStudios.join(', ')}.` : 'No hay estudios rechazados explicitos.',
    favoriteFormats.length > 0 ? `Formatos favoritos explicitos: ${favoriteFormats.join(', ')}.` : 'No hay formatos favoritos explicitos.',
    dislikedFormats.length > 0 ? `Formatos rechazados explicitos: ${dislikedFormats.join(', ')}.` : 'No hay formatos rechazados explicitos.',
    favoriteToneTags.length > 0 ? `Tonos favoritos explicitos: ${favoriteToneTags.join(', ')}.` : 'No hay tonos favoritos explicitos.',
    dislikedToneTags.length > 0 ? `Tonos rechazados explicitos: ${dislikedToneTags.join(', ')}.` : 'No hay tonos rechazados explicitos.',
    preferredEpisodeLength !== 'desconocido' ? `Duracion preferida: ${preferredEpisodeLength}.` : 'No hay duracion preferida explicita.',
    dislikedEpisodeLengths.length > 0 ? `Duraciones rechazadas: ${dislikedEpisodeLengths.join(', ')}.` : 'No hay duraciones rechazadas explicitas.',
    likedAnime.length > 0 ? `Series marcadas como gustadas: ${likedAnime.map(item => item.title).join(', ')}.` : 'No hay series marcadas como gustadas.',
    dislikedAnime.length > 0 ? `Series rechazadas: ${dislikedAnime.map(item => item.title).join(', ')}.` : 'No hay series rechazadas.',
    ...inferredGenres.slice(0, 10).map(item => `Género ${item.genre}: total=${item.total}, completadas=${item.completed}, favoritas=${item.favorites}, abandonadas=${item.dropped}, scoreMedio=${item.averageUserScore}, peso=${item.weight}.`)
  ];

  const profile: UserSoulProfile = {
    generatedAt: new Date().toISOString(),
    librarySize: toNumber(libraryCount?.count),
    trackedSeries: toNumber(trackedCount?.count),
    favoriteGenres,
    dislikedGenres,
    favoriteStudios,
    dislikedStudios,
    favoriteFormats,
    dislikedFormats,
    favoriteToneTags,
    dislikedToneTags,
    preferredEpisodeLength,
    dislikedEpisodeLengths,
    likedAnime,
    dislikedAnime,
    inferredGenres,
    topStudios,
    frequentFormats,
    statusDistribution,
    recommendationHints,
    trace
  };

  await setAssistantMemory('user_soul_profile', profile, 'profile', 'library_analysis', 95);
  await setAssistantMemory('preference_trace', trace, 'analytics', 'library_analysis', 90);
  await setAssistantMemory('recommendation_hints', recommendationHints, 'recommendations', 'library_analysis', 90);

  try {
    const soulPath = getSoulPath();
    const dataDir = path.dirname(soulPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(soulPath, JSON.stringify(profile, null, 2), 'utf-8');
    console.log(`[Memory] Perfil de usuario guardado en: ${soulPath}`);
  } catch (err: any) {
    console.error(`[Memory] Error guardando perfil de usuario: ${err.message}`);
  }

  return profile;
}

export async function generateUserSoulFile(): Promise<void> {
  await buildUserSoulProfile();
}

export async function getUserSoulData(): Promise<any> {
  const storedProfile = await getAssistantMemory<UserSoulProfile>('user_soul_profile');
  if (storedProfile) return storedProfile;

  const soulPath = getSoulPath();
  try {
    if (fs.existsSync(soulPath)) {
      return JSON.parse(fs.readFileSync(soulPath, 'utf-8'));
    }
  } catch (err) {
    console.error(`[Memory] Error leyendo perfil de usuario: ${err}`);
  }
  return null;
}
