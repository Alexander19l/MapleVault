/**
 * validators.ts — Validación centralizada de datos de entrada
 * Previene inyección SQL, path traversal y payloads maliciosos
 */

// =====================================
// VALIDADORES DE ANIME
// =====================================

export interface AnimeInputData {
  title?: unknown;
  synopsis?: unknown;
  year?: unknown;
  season?: unknown;
  type?: unknown;
  status?: unknown;
  episodes?: unknown;
  score?: unknown;
  cover_image?: unknown;
  studio?: unknown;
  genres?: unknown;
}

const ALLOWED_SEASONS = ['winter', 'spring', 'summer', 'fall', 'unknown'];
const ALLOWED_TYPES = ['tv', 'movie', 'ova', 'ona', 'special', 'unknown'];
const ALLOWED_STATUSES = ['finished', 'airing', 'upcoming', 'cancelled', 'unknown'];
const ALLOWED_WATCH_STATUSES = ['watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold'];
const ALLOWED_SORT_FIELDS = ['title', 'score', 'year', 'year_desc', 'year_asc', 'created_at', 'popularity'];
const MAX_STRING_LENGTH = 2000;
const MAX_TITLE_LENGTH = 500;
const MAX_GENRES = 20;

/**
 * Valida y sanitiza datos de anime antes de insertar en DB
 */
export function validateAnimeInput(data: AnimeInputData): { valid: boolean; errors: string[]; sanitized: Partial<AnimeInputData> } {
  const errors: string[] = [];
  const sanitized: Record<string, any> = {};

  // Título — requerido
  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push('El título es requerido y debe ser texto.');
    } else if (data.title.length > MAX_TITLE_LENGTH) {
      errors.push(`El título no puede superar ${MAX_TITLE_LENGTH} caracteres.`);
    } else {
      sanitized.title = data.title.trim().replace(/[\x00-\x1F\x7F]/g, ''); // eliminar control chars
    }
  }

  // Sinopsis — opcional
  if (data.synopsis !== undefined) {
    if (typeof data.synopsis !== 'string') {
      errors.push('La sinopsis debe ser texto.');
    } else {
      sanitized.synopsis = data.synopsis.slice(0, MAX_STRING_LENGTH).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
  }

  // Año — numérico
  if (data.year !== undefined) {
    const year = Number(data.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      errors.push('El año debe ser un número entero entre 1900 y 2100.');
    } else {
      sanitized.year = year;
    }
  }

  // Temporada
  if (data.season !== undefined) {
    const season = String(data.season).toLowerCase().trim();
    if (!ALLOWED_SEASONS.includes(season)) {
      errors.push(`La temporada debe ser una de: ${ALLOWED_SEASONS.join(', ')}.`);
    } else {
      sanitized.season = season;
    }
  }

  // Tipo
  if (data.type !== undefined) {
    const type = String(data.type).toLowerCase().trim();
    if (!ALLOWED_TYPES.includes(type)) {
      errors.push(`El tipo debe ser uno de: ${ALLOWED_TYPES.join(', ')}.`);
    } else {
      sanitized.type = type;
    }
  }

  // Estado
  if (data.status !== undefined) {
    const status = String(data.status).toLowerCase().trim();
    if (!ALLOWED_STATUSES.includes(status)) {
      errors.push(`El estado debe ser uno de: ${ALLOWED_STATUSES.join(', ')}.`);
    } else {
      sanitized.status = status;
    }
  }

  // Episodios
  if (data.episodes !== undefined) {
    const eps = Number(data.episodes);
    if (!Number.isInteger(eps) || eps < 0 || eps > 10000) {
      errors.push('El número de episodios debe ser un entero entre 0 y 10000.');
    } else {
      sanitized.episodes = eps;
    }
  }

  // Puntuación
  if (data.score !== undefined) {
    const score = Number(data.score);
    if (isNaN(score) || score < 0 || score > 10) {
      errors.push('La puntuación debe ser un número entre 0 y 10.');
    } else {
      sanitized.score = Math.round(score * 100) / 100;
    }
  }

  // Cover image URL
  if (data.cover_image !== undefined) {
    if (typeof data.cover_image !== 'string') {
      errors.push('La imagen de portada debe ser una URL.');
    } else {
      const validated = validateImageUrl(data.cover_image);
      if (!validated.valid) {
        errors.push(validated.reason || 'URL de imagen no válida.');
      } else {
        sanitized.cover_image = validated.url;
      }
    }
  }

  // Estudio
  if (data.studio !== undefined) {
    if (typeof data.studio !== 'string') {
      errors.push('El estudio debe ser texto.');
    } else {
      sanitized.studio = data.studio.slice(0, 200).trim();
    }
  }

  // Géneros
  if (data.genres !== undefined) {
    if (!Array.isArray(data.genres)) {
      errors.push('Los géneros deben ser un array.');
    } else if (data.genres.length > MAX_GENRES) {
      errors.push(`No se permiten más de ${MAX_GENRES} géneros.`);
    } else {
      sanitized.genres = data.genres
        .filter(g => typeof g === 'string')
        .map(g => String(g).slice(0, 100).trim())
        .filter(g => g.length > 0);
    }
  }

  return { valid: errors.length === 0, errors, sanitized };
}

// =====================================
// VALIDADORES DE LISTA DE USUARIO
// =====================================

export function validateUserListInput(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Number.isInteger(Number(data.anime_id)) || Number(data.anime_id) <= 0) {
    errors.push('El anime_id debe ser un entero positivo.');
  }

  if (!data.watch_status || !ALLOWED_WATCH_STATUSES.includes(String(data.watch_status))) {
    errors.push(`watch_status debe ser uno de: ${ALLOWED_WATCH_STATUSES.join(', ')}.`);
  }

  if (data.user_score !== undefined) {
    const score = Number(data.user_score);
    if (isNaN(score) || score < 0 || score > 10) {
      errors.push('user_score debe ser un número entre 0 y 10.');
    }
  }

  if (data.episodes_watched !== undefined) {
    const eps = Number(data.episodes_watched);
    if (!Number.isInteger(eps) || eps < 0 || eps > 10000) {
      errors.push('episodes_watched debe ser un entero entre 0 y 10000.');
    }
  }

  if (data.notes !== undefined && typeof data.notes !== 'string') {
    errors.push('notes debe ser texto.');
  }

  if (data.notes && data.notes.length > 5000) {
    errors.push('notes no puede superar 5000 caracteres.');
  }

  return { valid: errors.length === 0, errors };
}

// =====================================
// VALIDADORES DE QUERY/FILTROS
// =====================================

export function validateSearchFilters(filters: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};

  if (filters.q) {
    safe.q = String(filters.q).slice(0, 200).replace(/[\x00-\x1F\x7F<>'"]/g, '');
  }

  if (filters.year) {
    const y = Number(filters.year);
    if (Number.isInteger(y) && y >= 1900 && y <= 2100) safe.year = y;
  }

  if (filters.season && ALLOWED_SEASONS.includes(String(filters.season).toLowerCase())) {
    safe.season = String(filters.season).toLowerCase();
  }

  if (filters.status && ALLOWED_STATUSES.includes(String(filters.status).toLowerCase())) {
    safe.status = String(filters.status).toLowerCase();
  }

  if (filters.type && ALLOWED_TYPES.includes(String(filters.type).toLowerCase())) {
    safe.type = String(filters.type).toLowerCase();
  }

  if (filters.score) {
    const s = Number(filters.score);
    if (!isNaN(s) && s >= 0 && s <= 10) safe.score = s;
  }

  if (filters.genre) {
    safe.genre = String(filters.genre).slice(0, 100).replace(/[<>'"%;]/g, '');
  }

  if (filters.sort && ALLOWED_SORT_FIELDS.includes(String(filters.sort))) {
    safe.sort = String(filters.sort);
  }

  if (filters.limit) {
    const limit = Number(filters.limit);
    if (Number.isInteger(limit) && limit > 0 && limit <= 500) safe.limit = limit;
  }

  if (filters.offset) {
    const offset = Number(filters.offset);
    if (Number.isInteger(offset) && offset >= 0 && offset <= 1000000) safe.offset = offset;
  }

  if (filters.withTotal === 'true' || filters.withTotal === true) {
    safe.withTotal = true;
  }

  if (filters.translateSynopsis === 'true' || filters.translateSynopsis === true) {
    safe.translateSynopsis = true;
  }

  if (filters.includeSynopsis === 'true' || filters.includeSynopsis === true) {
    safe.includeSynopsis = true;
  }

  return safe;
}

// =====================================
// VALIDADOR DE IDs
// =====================================

export function validateId(id: unknown): number | null {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0 || num > 2147483647) return null;
  return num;
}

// =====================================
// VALIDADOR DE URLS DE IMAGEN
// =====================================

const ALLOWED_IMAGE_DOMAINS = [
  's4.anilist.co',
  'cdn.myanimelist.net',
  'img.kitsu.app',
  'images.unsplash.com',
  'i.ibb.co',
  'media.kitsu.app',
  'img.anisearch.com',
  'animeschedule.net',
  'staticg.sportskeeda.com',
  'upload.wikimedia.org'
];

export function validateImageUrl(urlStr: string): { valid: boolean; url: string; reason?: string } {
  if (!urlStr || urlStr.trim().length === 0) {
    return { valid: true, url: '' }; // vacío es permitido (usará placeholder)
  }

  try {
    const parsed = new URL(urlStr.trim());

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, url: '', reason: `Protocolo no permitido: ${parsed.protocol}` };
    }

    // Rechazar IPs privadas/locales
    const hostname = parsed.hostname;
    const isPrivate172 = /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    if (
      hostname === 'localhost' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      isPrivate172 ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    ) {
      return { valid: false, url: '', reason: 'No se permiten URLs a redes locales.' };
    }

    // Si es un dominio de confianza, permitir directamente
    if (ALLOWED_IMAGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return { valid: true, url: parsed.toString() };
    }

    // Para dominios externos desconocidos, permitir pero con advertencia
    // No bloqueamos imágenes externas ya que los scrapers de anime usan muchos CDNs distintos
    return { valid: true, url: parsed.toString() };
  } catch (_) {
    return { valid: false, url: '', reason: 'URL malformada.' };
  }
}

export function validateLocalServiceUrl(
  urlStr: unknown,
  allowRemote = process.env.MAPLEVAULT_ALLOW_REMOTE_SERVICES === 'true'
): { valid: boolean; url: string; reason?: string } {
  if (typeof urlStr !== 'string' || urlStr.trim().length === 0 || urlStr.length > 2048) {
    return { valid: false, url: '', reason: 'La URL del servicio no es válida.' };
  }

  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, url: '', reason: 'El servicio debe usar HTTP o HTTPS.' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, url: '', reason: 'La URL del servicio no puede incluir credenciales.' };
    }
    if (parsed.search || parsed.hash) {
      return { valid: false, url: '', reason: 'La URL del servicio no puede incluir parámetros ni fragmentos.' };
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLoopback = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '::1';

    if (!isLoopback && !allowRemote) {
      return {
        valid: false,
        url: '',
        reason: 'Solo se permiten servicios locales. Habilita MAPLEVAULT_ALLOW_REMOTE_SERVICES para usar un servidor remoto.'
      };
    }

    return { valid: true, url: parsed.toString().replace(/\/+$/, '') };
  } catch (_) {
    return { valid: false, url: '', reason: 'La URL del servicio está malformada.' };
  }
}

// =====================================
// VALIDADOR DE TAMAÑO DE PAYLOAD
// =====================================

export const MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024; // 1MB

export function validatePayloadSize(data: unknown): boolean {
  const json = JSON.stringify(data);
  return Buffer.byteLength(json, 'utf8') <= MAX_PAYLOAD_SIZE_BYTES;
}
