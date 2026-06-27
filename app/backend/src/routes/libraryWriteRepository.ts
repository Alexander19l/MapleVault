export interface LibraryWriteQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }>;
}

export interface ClearCatalogResult {
  clearedAll: boolean;
  deletedCount: number;
}

function getAnimeWriteParams(anime: any): any[] {
  return [
    anime.title,
    anime.title_romaji || '',
    anime.title_english || '',
    anime.title_japanese || '',
    anime.synopsis || '',
    anime.year || null,
    anime.season || '',
    anime.status || 'unknown',
    anime.type || 'tv',
    anime.episodes || null,
    anime.duration || null,
    anime.score || null,
    anime.popularity || 0,
    anime.cover_image || '',
    anime.banner_image || '',
    anime.studio || '',
    anime.source_material || '',
    anime.age_rating || '',
    anime.start_date || '',
    anime.end_date || '',
    anime.official_url || ''
  ];
}

async function replaceAnimeGenres(
  queryClient: LibraryWriteQueryClient,
  animeId: number,
  genres: unknown,
  clearExisting = false
): Promise<void> {
  if (clearExisting) {
    await queryClient.run('DELETE FROM anime_genres WHERE anime_id = ?', [animeId]);
  }

  if (!Array.isArray(genres)) return;

  for (const genreName of genres) {
    await queryClient.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
    const genreRow = await queryClient.get('SELECT id FROM genres WHERE name = ?', [genreName]);
    if (genreRow) {
      await queryClient.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [animeId, genreRow.id]);
    }
  }
}

export async function createAnimeWithGenres(
  queryClient: LibraryWriteQueryClient,
  anime: any
): Promise<number> {
  const result = await queryClient.run(`
    INSERT INTO anime (
      title, title_romaji, title_english, title_japanese, synopsis, year, season,
      status, type, episodes, duration, score, popularity, cover_image, banner_image,
      studio, source_material, age_rating, start_date, end_date, official_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, getAnimeWriteParams(anime));

  const animeId = result.lastID;
  await replaceAnimeGenres(queryClient, animeId, anime.genres);
  return animeId;
}

export async function updateAnimeWithGenres(
  queryClient: LibraryWriteQueryClient,
  animeId: number,
  anime: any
): Promise<boolean> {
  const existing = await queryClient.get('SELECT id FROM anime WHERE id = ?', [animeId]);
  if (!existing) return false;

  await queryClient.run(`
    UPDATE anime
    SET title = ?, title_romaji = ?, title_english = ?, title_japanese = ?,
        synopsis = ?, year = ?, season = ?, status = ?, type = ?, episodes = ?,
        duration = ?, score = ?, popularity = ?, cover_image = ?, banner_image = ?,
        studio = ?, source_material = ?, age_rating = ?, start_date = ?, end_date = ?,
        official_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [...getAnimeWriteParams(anime), animeId]);

  await replaceAnimeGenres(queryClient, animeId, anime.genres, true);
  return true;
}

export function deleteAnimeById(
  queryClient: LibraryWriteQueryClient,
  animeId: number
): Promise<{ lastID: number; changes: number }> {
  return queryClient.run('DELETE FROM anime WHERE id = ?', [animeId]);
}

export async function clearCatalogData(
  queryClient: LibraryWriteQueryClient,
  keepUserList: unknown
): Promise<ClearCatalogResult> {
  if (keepUserList === false) {
    await queryClient.run('DELETE FROM anime');
    await queryClient.run('DELETE FROM user_list');
    await queryClient.run('DELETE FROM watched_episodes');
    await queryClient.run('DELETE FROM anime_genres');
    await queryClient.run('DELETE FROM anime_relations');
    await queryClient.run('DELETE FROM genres');
    return { clearedAll: true, deletedCount: 0 };
  }

  const result = await queryClient.run(`
    DELETE FROM anime
    WHERE id NOT IN (SELECT anime_id FROM user_list)
  `);
  await queryClient.run(`
    DELETE FROM genres
    WHERE id NOT IN (SELECT genre_id FROM anime_genres)
  `);
  await queryClient.run(`
    DELETE FROM anime_relations
    WHERE anime_id NOT IN (SELECT id FROM anime)
  `);

  return {
    clearedAll: false,
    deletedCount: result.changes
  };
}

export function upsertUserListEntry(
  queryClient: LibraryWriteQueryClient,
  entry: any,
  startedAt: string | null
): Promise<{ lastID: number; changes: number }> {
  return queryClient.run(`
    INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, notes, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(anime_id) DO UPDATE SET
      watch_status = excluded.watch_status,
      favorite = excluded.favorite,
      user_score = excluded.user_score,
      episodes_watched = excluded.episodes_watched,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `, [
    entry.anime_id,
    entry.watch_status,
    entry.favorite || 0,
    entry.user_score || 0,
    entry.episodes_watched || 0,
    entry.notes || '',
    startedAt
  ]);
}

export function getUserListEntryForUpdate(
  queryClient: LibraryWriteQueryClient,
  userListId: number
): Promise<any> {
  return queryClient.get('SELECT id, watch_status FROM user_list WHERE id = ?', [userListId]);
}

export function updateUserListEntry(
  queryClient: LibraryWriteQueryClient,
  userListId: number,
  entry: any,
  completedAt: string | null
): Promise<{ lastID: number; changes: number }> {
  return queryClient.run(`
    UPDATE user_list
    SET watch_status = ?, favorite = ?, user_score = ?, episodes_watched = ?,
        notes = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    entry.watch_status,
    entry.favorite || 0,
    entry.user_score || 0,
    entry.episodes_watched || 0,
    entry.notes || '',
    completedAt,
    userListId
  ]);
}

export function deleteUserListEntry(
  queryClient: LibraryWriteQueryClient,
  userListId: number
): Promise<{ lastID: number; changes: number }> {
  return queryClient.run('DELETE FROM user_list WHERE id = ?', [userListId]);
}
