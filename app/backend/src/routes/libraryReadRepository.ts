export interface LibraryReadQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
}

export interface UserListFilters {
  status?: unknown;
  favorite?: unknown;
}

export async function getAnimeWithUserStateAndGenres(
  queryClient: LibraryReadQueryClient,
  animeId: number
): Promise<any | null> {
  const anime = await queryClient.get(`
    SELECT a.*, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched, ul.notes, ul.started_at, ul.completed_at
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    WHERE a.id = ?
  `, [animeId]);

  if (!anime) return null;

  const genres = await queryClient.all(`
    SELECT g.name FROM anime_genres ag
    JOIN genres g ON ag.genre_id = g.id
    WHERE ag.anime_id = ?
  `, [animeId]);

  return {
    ...anime,
    genres: genres.map((genre: any) => genre.name)
  };
}

export function getAnimeRelations(
  queryClient: LibraryReadQueryClient,
  animeId: number
): Promise<any[]> {
  return queryClient.all(`
    SELECT r.*, a.id as local_anime_id
    FROM anime_relations r
    LEFT JOIN anime a ON r.related_external_id = a.external_id AND a.source = 'AniList'
    WHERE r.anime_id = ?
      AND UPPER(COALESCE(r.relation_type, '')) IN ('PREQUEL', 'SEQUEL')
      AND UPPER(COALESCE(r.type, '')) = 'ANIME'
    ORDER BY CASE UPPER(r.relation_type) WHEN 'PREQUEL' THEN 0 ELSE 1 END, r.title
  `, [animeId]);
}

export function getUserListRows(
  queryClient: LibraryReadQueryClient,
  filters: UserListFilters = {}
): Promise<any[]> {
  let sql = `
    SELECT ul.*, a.title, a.title_romaji, a.title_english, a.title_japanese,
           a.synopsis, a.status, a.type, a.duration, a.cover_image, a.banner_image,
           a.studio, a.year, a.season, a.episodes, a.score as mal_score,
           GROUP_CONCAT(DISTINCT g.name) as genres_joined
    FROM user_list ul
    JOIN anime a ON ul.anime_id = a.id
    LEFT JOIN anime_genres ag ON a.id = ag.anime_id
    LEFT JOIN genres g ON ag.genre_id = g.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.status) {
    sql += ' AND ul.watch_status = ? ';
    params.push(filters.status);
  }
  if (filters.favorite) {
    sql += ' AND ul.favorite = ? ';
    params.push(parseInt(filters.favorite as string, 10));
  }

  sql += ' GROUP BY ul.id ';
  sql += ' ORDER BY ul.updated_at DESC ';

  return queryClient.all(sql, params);
}

export async function getGenreNames(queryClient: LibraryReadQueryClient): Promise<string[]> {
  const genres = await queryClient.all('SELECT name FROM genres ORDER BY name ASC');
  return genres.map((genre: any) => genre.name);
}

export function getLocalAnimeRowsByExternalIds(
  queryClient: LibraryReadQueryClient,
  externalIds: number[]
): Promise<Array<{ id: number; external_id: number }>> {
  if (externalIds.length === 0) return Promise.resolve([]);

  return queryClient.all(
    `SELECT id, external_id
     FROM anime
     WHERE source = 'AniList'
       AND external_id IN (${externalIds.map(() => '?').join(', ')})`,
    externalIds
  );
}

export async function getDuplicateAnimeGroups(queryClient: LibraryReadQueryClient): Promise<any[]> {
  const groups = await queryClient.all(`
    SELECT LOWER(title) as normalized_title,
           COALESCE(year, 0) as year,
           COUNT(*) as count,
           GROUP_CONCAT(id) as ids,
           GROUP_CONCAT(source) as sources
    FROM anime
    GROUP BY normalized_title, year
    HAVING COUNT(*) > 1
    ORDER BY count DESC, normalized_title ASC
  `);

  return groups.map((group: any) => ({
    ...group,
    ids: String(group.ids || '').split(',').filter(Boolean).map(Number),
    sources: String(group.sources || '').split(',').filter(Boolean)
  }));
}
