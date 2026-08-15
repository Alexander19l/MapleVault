export interface ExternalEpisodeQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<{ lastID: number; changes: number }>;
}

export interface AnimeEpisodeIdentity {
  id: number;
  title: string;
  title_romaji?: string | null;
  title_english?: string | null;
  year?: number | null;
  type?: string | null;
}

export interface EpisodeSourceBinding {
  animeId: number;
  providerId: string;
  externalKey: string;
  sourceTitle: string;
  sourceUrl: string;
}

export function getAnimeEpisodeIdentity(
  queryClient: ExternalEpisodeQueryClient,
  animeId: number
): Promise<AnimeEpisodeIdentity | undefined> {
  return queryClient.get(
    `SELECT id, title, title_romaji, title_english, year, type
     FROM anime
     WHERE id = ?`,
    [animeId]
  );
}

export async function getEpisodeSourceBinding(
  queryClient: ExternalEpisodeQueryClient,
  animeId: number,
  providerId: string
): Promise<EpisodeSourceBinding | null> {
  const row = await queryClient.get(
    `SELECT anime_id, provider_id, external_key, source_title, source_url
     FROM anime_episode_sources
     WHERE anime_id = ? AND provider_id = ?`,
    [animeId, providerId]
  );

  if (!row) return null;
  return {
    animeId: Number(row.anime_id),
    providerId: String(row.provider_id),
    externalKey: String(row.external_key),
    sourceTitle: String(row.source_title || ''),
    sourceUrl: String(row.source_url || '')
  };
}

export async function saveEpisodeSourceBinding(
  queryClient: ExternalEpisodeQueryClient,
  binding: EpisodeSourceBinding
): Promise<void> {
  await queryClient.run(
    `INSERT INTO anime_episode_sources (
       anime_id, provider_id, external_key, source_title, source_url, verified_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(anime_id, provider_id) DO UPDATE SET
       external_key = excluded.external_key,
       source_title = excluded.source_title,
       source_url = excluded.source_url,
       verified_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [
      binding.animeId,
      binding.providerId,
      binding.externalKey,
      binding.sourceTitle,
      binding.sourceUrl
    ]
  );
}

export function clearEpisodeSourceBinding(
  queryClient: ExternalEpisodeQueryClient,
  animeId: number,
  providerId: string
): Promise<{ lastID: number; changes: number }> {
  return queryClient.run(
    'DELETE FROM anime_episode_sources WHERE anime_id = ? AND provider_id = ?',
    [animeId, providerId]
  );
}
