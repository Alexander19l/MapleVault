export interface EpisodeQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }>;
}

const ALLOWED_SLUG_COLUMNS = new Set([
  'animeav1_slug',
  'tioanime_slug',
  'jkanime_slug',
  'animeflv_slug'
]);

export function assertValidSlugColumn(slugColumn: string): void {
  if (!ALLOWED_SLUG_COLUMNS.has(slugColumn)) {
    throw new Error('Columna de slug no permitida.');
  }
}

export function getAnimeForSlugLookup(
  queryClient: EpisodeQueryClient,
  animeId: number,
  slugColumn: string
): Promise<any> {
  assertValidSlugColumn(slugColumn);
  return queryClient.get(
    `SELECT id, title, title_romaji, title_english, ${slugColumn} FROM anime WHERE id = ?`,
    [animeId]
  );
}

export function getAnimeSlug(
  queryClient: EpisodeQueryClient,
  animeId: number,
  slugColumn: string
): Promise<any> {
  assertValidSlugColumn(slugColumn);
  return queryClient.get(
    `SELECT id, ${slugColumn} FROM anime WHERE id = ?`,
    [animeId]
  );
}

export function saveAnimeSlug(
  queryClient: EpisodeQueryClient,
  animeId: number,
  slugColumn: string,
  slug: string
): Promise<{ lastID: number; changes: number }> {
  assertValidSlugColumn(slugColumn);
  return queryClient.run(`UPDATE anime SET ${slugColumn} = ? WHERE id = ?`, [slug, animeId]);
}

export async function getWatchedEpisodeNumbers(
  queryClient: EpisodeQueryClient,
  animeId: number
): Promise<number[]> {
  const rows = await queryClient.all('SELECT episode_number FROM watched_episodes WHERE anime_id = ?', [animeId]);
  return rows.map((row: any) => row.episode_number);
}

export async function setEpisodeWatchedState(
  queryClient: EpisodeQueryClient,
  animeId: number,
  episodeNumber: number,
  watched: boolean
): Promise<number> {
  if (watched) {
    await queryClient.run(
      'INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)',
      [animeId, episodeNumber]
    );
  } else {
    await queryClient.run(
      'DELETE FROM watched_episodes WHERE anime_id = ? AND episode_number = ?',
      [animeId, episodeNumber]
    );
  }

  const countRow = await queryClient.get('SELECT COUNT(*) as cnt FROM watched_episodes WHERE anime_id = ?', [animeId]);
  const watchedCount = Number(countRow?.cnt) || 0;
  await queryClient.run(
    'UPDATE user_list SET episodes_watched = ?, updated_at = CURRENT_TIMESTAMP WHERE anime_id = ?',
    [watchedCount, animeId]
  );

  return watchedCount;
}
