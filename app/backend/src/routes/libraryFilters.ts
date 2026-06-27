export type AdultFilterMode = 'only' | 'include' | undefined;

export interface AnimeFilterClause {
  whereSql: string;
  params: any[];
}

export function buildAnimeFilterClause(
  filters: Record<string, any>,
  adult: AdultFilterMode
): AnimeFilterClause {
  const { q, year, season, genre, status, type, score } = filters;
  const params: any[] = [];
  let whereSql = ' WHERE 1=1 ';

  if (adult === 'only') {
    whereSql += ` AND (a.is_adult = 1 OR a.id IN (SELECT anime_id FROM anime_genres ag2 JOIN genres g2 ON ag2.genre_id = g2.id WHERE g2.name = 'Hentai') OR a.age_rating LIKE '%Rx%' OR a.age_rating LIKE '%Hentai%') `;
  } else if (q && String(q).trim() !== '') {
    // Explicit searches may return adult matches if the user asks for them.
  } else {
    whereSql += ` AND a.is_adult = 0 AND a.id NOT IN (SELECT anime_id FROM anime_genres ag2 JOIN genres g2 ON ag2.genre_id = g2.id WHERE g2.name = 'Hentai') AND (a.age_rating IS NULL OR (a.age_rating NOT LIKE '%Rx%' AND a.age_rating NOT LIKE '%Hentai%')) `;
  }

  if (q) {
    whereSql += ` AND (a.title LIKE ? OR a.title_romaji LIKE ? OR a.title_english LIKE ?) `;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (year) {
    whereSql += ` AND a.year = ? `;
    params.push(parseInt(year as string, 10));
  }
  if (season) {
    whereSql += ` AND a.season = ? `;
    params.push(String(season).toLowerCase());
  }
  if (genre) {
    whereSql += `
      AND EXISTS (
        SELECT 1
        FROM anime_genres agf
        JOIN genres gf ON agf.genre_id = gf.id
        WHERE agf.anime_id = a.id
          AND gf.name = ?
      )
    `;
    params.push(genre as string);
  }
  if (status) {
    whereSql += ` AND a.status = ? `;
    params.push(status as string);
  }
  if (type) {
    whereSql += ` AND a.type = ? `;
    params.push(type as string);
  }
  if (score) {
    whereSql += ` AND a.score >= ? `;
    params.push(parseFloat(score as string));
  }

  return { whereSql, params };
}

export function buildAnimeOrderClause(sort: string | undefined): string {
  if (sort === 'title') return ' ORDER BY a.title ASC ';
  if (sort === 'year_desc') return ' ORDER BY a.year DESC, a.start_date DESC ';
  if (sort === 'year_asc') return ' ORDER BY a.year ASC, a.start_date ASC ';
  if (sort === 'score') return ' ORDER BY a.score DESC ';
  if (sort === 'popularity') return ' ORDER BY a.popularity DESC ';
  return ' ORDER BY a.id DESC ';
}

export function buildNonAdultCondition() {
  return `
    COALESCE(a.is_adult, 0) = 0
    AND a.id NOT IN (
      SELECT anime_id
      FROM anime_genres ag2
      JOIN genres g2 ON ag2.genre_id = g2.id
      WHERE g2.name = 'Hentai'
    )
    AND (
      a.age_rating IS NULL
      OR (a.age_rating NOT LIKE '%Rx%' AND a.age_rating NOT LIKE '%Hentai%')
    )
  `;
}
