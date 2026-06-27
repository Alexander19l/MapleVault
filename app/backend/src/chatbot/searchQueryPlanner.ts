import { splitGenres } from '../recommendations/scoring';
import {
  buildSearchTextContext,
  getAnimeSearchOrderBy,
  hasAnimeSearchCriteria,
  uniqueLowercaseFilters
} from './searchQueryHelpers';
import type { NLPResult } from './types';

export interface AnimeSearchPlan {
  queryText: string;
  onlineQueryText: string;
  hasSearchCriteria: boolean;
  sql: string;
  params: any[];
  genreFilterCount: number;
}

export function buildAnimeSearchPlan(entities: NLPResult['entities']): AnimeSearchPlan {
  const { queryText, onlineQueryText } = buildSearchTextContext(entities);
  const genreFilters = splitGenres(entities.genre);
  const tagFilters = uniqueLowercaseFilters(entities.tags);
  const excludedTagFilters = uniqueLowercaseFilters(entities.exclude_tags);
  const params: any[] = [];
  const conditions: string[] = [];
  const hasSearchCriteria = hasAnimeSearchCriteria(entities, queryText, tagFilters, excludedTagFilters);

  if (!hasSearchCriteria) {
    return {
      queryText,
      onlineQueryText,
      hasSearchCriteria,
      sql: '',
      params,
      genreFilterCount: 0
    };
  }

  let sql = `
    SELECT DISTINCT a.*, GROUP_CONCAT(g.name) as genres_joined FROM anime a
    LEFT JOIN anime_genres ag ON a.id = ag.anime_id
    LEFT JOIN genres g ON ag.genre_id = g.id
  `;

  if (queryText) {
    conditions.push('(LOWER(a.title) LIKE ? OR LOWER(a.title_romaji) LIKE ? OR LOWER(a.title_english) LIKE ?)');
    params.push(`%${queryText.toLowerCase()}%`, `%${queryText.toLowerCase()}%`, `%${queryText.toLowerCase()}%`);
  }

  if (genreFilters.length > 0) {
    conditions.push(`LOWER(g.name) IN (${genreFilters.map(() => '?').join(', ')})`);
    params.push(...genreFilters);
  }

  if (entities.year) {
    conditions.push('a.year = ?');
    params.push(entities.year);
  }

  if (entities.season) {
    conditions.push('a.season = ?');
    params.push(entities.season);
  }

  if (entities.studio) {
    conditions.push('LOWER(a.studio) LIKE ?');
    params.push(`%${String(entities.studio).toLowerCase()}%`);
  }

  if (entities.format) {
    conditions.push('LOWER(a.type) = ?');
    params.push(String(entities.format).toLowerCase());
  }

  if (entities.formats?.length) {
    const formats = [...new Set(entities.formats.map(format => String(format).toLowerCase()))];
    conditions.push(`LOWER(a.type) IN (${formats.map(() => '?').join(', ')})`);
    params.push(...formats);
  }

  if (entities.year_from) {
    conditions.push('a.year >= ?');
    params.push(entities.year_from);
  }

  if (entities.year_to) {
    conditions.push('a.year <= ?');
    params.push(entities.year_to);
  }

  if (entities.min_score !== undefined) {
    conditions.push('a.score >= ?');
    params.push(entities.min_score);
  }

  if (entities.max_score !== undefined) {
    conditions.push('a.score <= ?');
    params.push(entities.max_score);
  }

  if (entities.min_episodes !== undefined) {
    conditions.push('COALESCE(a.episodes, 0) >= ?');
    params.push(entities.min_episodes);
  }

  if (entities.max_episodes !== undefined) {
    conditions.push('a.episodes IS NOT NULL AND a.episodes > 0 AND a.episodes <= ?');
    params.push(entities.max_episodes);
  }

  if (entities.duration_max !== undefined) {
    conditions.push('a.duration IS NOT NULL AND a.duration > 0 AND a.duration <= ?');
    params.push(entities.duration_max);
  }

  if (entities.airing_status === 'finished') {
    conditions.push(`LOWER(COALESCE(a.status, '')) IN ('finished', 'completed', 'complete', 'finished airing')`);
  } else if (entities.airing_status === 'airing') {
    conditions.push(`LOWER(COALESCE(a.status, '')) IN ('airing', 'currently airing', 'releasing')`);
  } else if (entities.airing_status === 'upcoming') {
    conditions.push(`LOWER(COALESCE(a.status, '')) IN ('upcoming', 'not yet aired', 'not_yet_released')`);
  }

  if (entities.source_material) {
    conditions.push('LOWER(COALESCE(a.source_material, \'\')) = ?');
    params.push(String(entities.source_material).toLowerCase());
  }

  for (const excludedRoot of [entities.exclude_franchise, entities.exclude_related_to].filter(Boolean)) {
    const like = `%${String(excludedRoot).toLowerCase()}%`;
    conditions.push(`(
      LOWER(COALESCE(a.title, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_romaji, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_english, '')) NOT LIKE ?
    )`);
    params.push(like, like, like);
  }

  if (entities.max_episodes !== undefined && entities.max_episodes <= 26) {
    conditions.push(`(a.status IS NULL OR LOWER(a.status) IN ('finished', 'completed', 'complete'))`);
  }

  for (const tag of tagFilters) {
    conditions.push(`(
      LOWER(COALESCE(a.title, '')) LIKE ?
      OR LOWER(COALESCE(a.title_romaji, '')) LIKE ?
      OR LOWER(COALESCE(a.title_english, '')) LIKE ?
      OR LOWER(COALESCE(a.synopsis, '')) LIKE ?
      OR LOWER(COALESCE(a.studio, '')) LIKE ?
      OR LOWER(COALESCE(a.source_material, '')) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM anime_genres agt
        JOIN genres gt ON agt.genre_id = gt.id
        WHERE agt.anime_id = a.id
          AND LOWER(gt.name) LIKE ?
      )
    )`);
    const like = `%${tag}%`;
    params.push(like, like, like, like, like, like, like);
  }

  for (const tag of excludedTagFilters) {
    conditions.push(`(
      LOWER(COALESCE(a.title, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_romaji, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_english, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.synopsis, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.age_rating, '')) NOT LIKE ?
      AND NOT EXISTS (
        SELECT 1
        FROM anime_genres agx
        JOIN genres gx ON agx.genre_id = gx.id
        WHERE agx.anime_id = a.id
          AND LOWER(gx.name) LIKE ?
      )
    )`);
    const like = `%${tag}%`;
    params.push(like, like, like, like, like, like);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (genreFilters.length > 1) {
    sql += ' GROUP BY a.id HAVING COUNT(DISTINCT LOWER(g.name)) >= ?';
    params.push(genreFilters.length);
  } else {
    sql += ' GROUP BY a.id';
  }

  sql += ` ORDER BY ${getAnimeSearchOrderBy(entities.sort_by)} LIMIT 32`;

  return {
    queryText,
    onlineQueryText,
    hasSearchCriteria,
    sql,
    params,
    genreFilterCount: genreFilters.length
  };
}
