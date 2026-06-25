import { normalizeToneTag } from '../recommendations/toneTags';
import {
  getDisplayGenres,
  translateStatusLabel,
  translateTypeLabel
} from '../translation/translationService';

export function normalizeTitleKey(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decorateResult(anime: any, origin: 'local' | 'online') {
  return {
    ...anime,
    result_origin: origin
  };
}

export function mergeAnimeResults(localResults: any[], onlineResults: any[]) {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const item of [...localResults, ...onlineResults]) {
    const key = `${normalizeTitleKey(item.title || item.title_romaji || item.title_english)}:${item.year || ''}`;
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

export function inferSeasonNumberFromTitle(title: string): number | null {
  const normalized = normalizeTitleKey(title);
  const seasonMatch = normalized.match(/\b(?:season|temporada|s)\s*(\d{1,2})\b/);
  if (seasonMatch) return Number(seasonMatch[1]);

  const ordinalMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    quinta: 5,
    quinto: 5
  };

  for (const [word, value] of Object.entries(ordinalMap)) {
    if (normalized.includes(word)) return value;
  }

  return null;
}

export function fieldOrUnavailable(value: any): string {
  if (value === null || value === undefined || value === '') return 'dato no disponible';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'dato no disponible';
  return String(value);
}

export function formatEpisodeCount(anime: any): string {
  if (anime?.episodes !== null && anime?.episodes !== undefined && anime?.episodes !== '') {
    return String(anime.episodes);
  }

  if (anime?.result_origin === 'online' || anime?.source) {
    return 'se cargan al abrir la ficha o al importar la serie';
  }

  return 'dato no disponible';
}

export function uniqueToneTags(values: Array<string | undefined> | undefined): string[] {
  return [...new Set((values || []).map(value => normalizeToneTag(value)).filter(Boolean) as string[])];
}

export function formatAnimeInfo(anime: any): string {
  return [
    `**${fieldOrUnavailable(anime.title)}**`,
    `Origen: ${fieldOrUnavailable(anime.result_origin || anime.source)}`,
    `Año: ${fieldOrUnavailable(anime.year)}`,
    `Formato: ${fieldOrUnavailable(anime.type_label_es || translateTypeLabel(anime.type) || anime.type)}`,
    `Estado: ${fieldOrUnavailable(anime.status_label_es || translateStatusLabel(anime.status) || anime.status)}`,
    `Episodios: ${formatEpisodeCount(anime)}`,
    `Score: ${fieldOrUnavailable(anime.score)}`,
    `Estudio: ${fieldOrUnavailable(anime.studio)}`,
    `Géneros: ${fieldOrUnavailable(getDisplayGenres(anime))}`,
    `Sinopsis: ${fieldOrUnavailable(anime.synopsis_es || anime.synopsis)}`
  ].join('\n');
}
