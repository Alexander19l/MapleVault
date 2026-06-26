import {
  type AdultFilterMode,
  buildAnimeFilterClause,
  buildAnimeOrderClause
} from './libraryFilters';

export interface LibraryCatalogQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
}

export interface CatalogQueryFilters {
  sort?: string;
  limit?: number;
  offset?: number;
  withTotal?: boolean;
  translateSynopsis?: boolean;
  includeSynopsis?: boolean;
  [key: string]: any;
}

export interface CatalogQueryResult {
  rows: any[];
  total?: number;
  limit: number;
  offset: number;
}

function buildAnimeSelect(includeSynopsis?: boolean, translateSynopsis?: boolean): string {
  if (includeSynopsis || translateSynopsis) return 'a.*';

  return `
    a.id, a.external_id, a.source, a.title, a.title_romaji, a.title_english, a.title_japanese,
    a.year, a.season, a.status, a.type, a.episodes, a.duration, a.score, a.popularity,
    a.cover_image, a.banner_image, a.studio, a.source_material, a.age_rating,
    a.start_date, a.end_date, a.created_at, a.updated_at, a.is_adult
  `;
}

export async function getCatalogAnimeRows(
  queryClient: LibraryCatalogQueryClient,
  filters: CatalogQueryFilters,
  adult: AdultFilterMode
): Promise<CatalogQueryResult> {
  const { sort, limit, offset, withTotal, translateSynopsis, includeSynopsis } = filters;
  const { whereSql, params } = buildAnimeFilterClause(filters, adult);
  const animeSelect = buildAnimeSelect(includeSynopsis, translateSynopsis);

  let sql = `
    SELECT ${animeSelect}, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched, ul.notes,
           GROUP_CONCAT(DISTINCT g.name) as genres_joined
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    LEFT JOIN anime_genres ag ON a.id = ag.anime_id
    LEFT JOIN genres g ON ag.genre_id = g.id
    ${whereSql}
  `;

  sql += ' GROUP BY a.id ';
  sql += buildAnimeOrderClause(sort);

  const listParams = [...params];
  if (limit) {
    sql += ' LIMIT ? OFFSET ? ';
    listParams.push(limit, offset || 0);
  }

  const rows = await queryClient.all(sql, listParams);
  if (!withTotal) {
    return {
      rows,
      limit: limit || rows.length,
      offset: offset || 0
    };
  }

  const countRow = await queryClient.get(`
    SELECT COUNT(DISTINCT a.id) as total
    FROM anime a
    ${whereSql}
  `, params);

  return {
    rows,
    total: Number(countRow?.total) || 0,
    limit: limit || rows.length,
    offset: offset || 0
  };
}
