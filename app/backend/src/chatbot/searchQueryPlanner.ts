import { splitGenres } from '../recommendations/scoring';
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
  const genreFilters = splitGenres(entities.genre);
  const tagFilters = Array.isArray(entities.tags) ? [...new Set(entities.tags.map(tag => String(tag).toLowerCase()).filter(Boolean))] : [];
  const excludedTagFilters = Array.isArray(entities.exclude_tags) ? [...new Set(entities.exclude_tags.map(tag => String(tag).toLowerCase()).filter(Boolean))] : [];
  const params: any[] = [];
  const conditions: string[] = [];
  const hasSearchCriteria = Boolean(
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

  const orderBy: Record<string, string> = {
    score_asc: 'a.score ASC, a.popularity DESC, a.id DESC',
    score_desc: 'a.score DESC, a.popularity DESC, a.id DESC',
    release_date_asc: 'a.year ASC, a.start_date ASC, a.id ASC',
    release_date_desc: 'a.year DESC, a.start_date DESC, a.id DESC',
    popularity_desc: 'a.popularity DESC, a.score DESC, a.id DESC'
  };
  sql += ` ORDER BY ${orderBy[entities.sort_by || 'popularity_desc']} LIMIT 32`;

  return {
    queryText,
    onlineQueryText,
    hasSearchCriteria,
    sql,
    params,
    genreFilterCount: genreFilters.length
  };
}
