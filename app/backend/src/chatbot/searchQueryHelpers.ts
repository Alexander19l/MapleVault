import type { NLPResult } from './types';

export interface SearchTextContext {
  queryText: string;
  onlineQueryText: string;
}

export function uniqueLowercaseFilters(values: unknown): string[] {
  return Array.isArray(values)
    ? [...new Set(values.map(value => String(value).toLowerCase()).filter(Boolean))]
    : [];
}

export function buildSearchTextContext(entities: NLPResult['entities']): SearchTextContext {
  const queryText = String(entities.query || entities.animeTitle || '').trim();
  const tagQuery = Array.isArray(entities.tags) ? entities.tags.join(' ') : '';
  const onlineQueryText = queryText || String(
    entities.staff
    || entities.genre
    || tagQuery
    || entities.studio
    || entities.source_material
    || entities.format
    || ''
  ).trim();

  return {
    queryText,
    onlineQueryText
  };
}

export function hasAnimeSearchCriteria(
  entities: NLPResult['entities'],
  queryText: string,
  tagFilters: string[],
  excludedTagFilters: string[]
): boolean {
  return Boolean(
    queryText
    || entities.genre
    || entities.year
    || entities.season
    || entities.studio
    || entities.format
    || entities.formats?.length
    || entities.year_from
    || entities.year_to
    || entities.min_episodes !== undefined
    || entities.max_episodes !== undefined
    || entities.duration_max !== undefined
    || tagFilters.length > 0
    || excludedTagFilters.length > 0
    || entities.min_score !== undefined
    || entities.max_score !== undefined
    || entities.airing_status
    || entities.staff
    || entities.source_material
    || entities.exclude_franchise
    || entities.exclude_related_to
    || entities.exclude_origin
  );
}

export function getAnimeSearchOrderBy(sortBy: NLPResult['entities']['sort_by']): string {
  const orderBy: Record<string, string> = {
    score_asc: 'a.score ASC, a.popularity DESC, a.id DESC',
    score_desc: 'a.score DESC, a.popularity DESC, a.id DESC',
    release_date_asc: 'a.year ASC, a.start_date ASC, a.id ASC',
    release_date_desc: 'a.year DESC, a.start_date DESC, a.id DESC',
    popularity_desc: 'a.popularity DESC, a.score DESC, a.id DESC'
  };

  return orderBy[sortBy || 'popularity_desc'];
}
