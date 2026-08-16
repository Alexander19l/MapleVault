import { attachJoinedGenres } from '../anime/animeRows';
import { validateAnimePayload } from '../anime/animePayload';
import type { NormalizedAnime } from '../scraping/scraper';
import { validateUserListInput } from '../security/validators';

export interface DataTransferQueryClient {
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<unknown>;
}

export type SaveAnimeToLocal = (anime: NormalizedAnime) => Promise<number>;

export interface DataTransferExport {
  version: string;
  exportedAt: string;
  animes: any[];
  userList: any[];
}

export interface DataTransferImportPayload {
  animes: any[];
  userList?: any[];
}

export interface DataTransferImportResult {
  importedAnimes: number;
  importedUserItems: number;
}

export async function exportUserData(
  queryClient: DataTransferQueryClient
): Promise<DataTransferExport> {
  const animes = attachJoinedGenres(await queryClient.all(`
    SELECT a.*, GROUP_CONCAT(DISTINCT g.name) as genres_joined
    FROM anime a
    LEFT JOIN anime_genres ag ON a.id = ag.anime_id
    LEFT JOIN genres g ON ag.genre_id = g.id
    GROUP BY a.id
    ORDER BY a.id ASC
  `));
  const userList = await queryClient.all('SELECT * FROM user_list');

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    animes,
    userList
  };
}

export async function importUserData(
  payload: DataTransferImportPayload,
  queryClient: DataTransferQueryClient,
  saveAnimeToLocal: SaveAnimeToLocal
): Promise<DataTransferImportResult> {
  const importedUserList = Array.isArray(payload.userList) ? payload.userList : [];
  let importedAnimes = 0;
  let importedUserItems = 0;

  for (const anime of payload.animes) {
    const validation = validateAnimePayload(anime);
    if (!validation.valid) {
      continue;
    }

    const animeId = await saveAnimeToLocal(toImportedNormalizedAnime(validation.data));
    importedAnimes++;

    const userItem = importedUserList.find((item: any) => item.anime_id === anime.id);
    if (!userItem) {
      continue;
    }

    const userValidation = validateUserListInput({ ...userItem, anime_id: animeId });
    if (!userValidation.valid) {
      continue;
    }

    await upsertImportedUserListItem(queryClient, animeId, userItem);
    importedUserItems++;
  }

  return {
    importedAnimes,
    importedUserItems
  };
}

function toImportedNormalizedAnime(safeAnime: Record<string, any>): NormalizedAnime {
  return {
    external_id: safeAnime.external_id || safeAnime.id || null,
    mal_id: safeAnime.mal_id || undefined,
    source: safeAnime.source || 'Import',
    title: safeAnime.title,
    title_romaji: safeAnime.title_romaji,
    title_english: safeAnime.title_english,
    title_japanese: safeAnime.title_japanese,
    synopsis: safeAnime.synopsis,
    year: safeAnime.year,
    season: safeAnime.season,
    status: safeAnime.status,
    type: safeAnime.type,
    episodes: safeAnime.episodes,
    duration: safeAnime.duration,
    score: safeAnime.score,
    popularity: safeAnime.popularity,
    cover_image: safeAnime.cover_image,
    banner_image: safeAnime.banner_image,
    studio: safeAnime.studio,
    source_material: safeAnime.source_material,
    start_date: safeAnime.start_date,
    end_date: safeAnime.end_date,
    genres: safeAnime.genres || []
  };
}

function upsertImportedUserListItem(
  queryClient: DataTransferQueryClient,
  animeId: number,
  userItem: any
): Promise<unknown> {
  return queryClient.run(`
    INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, notes, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(anime_id) DO UPDATE SET
      watch_status = excluded.watch_status,
      favorite = excluded.favorite,
      user_score = excluded.user_score,
      episodes_watched = excluded.episodes_watched,
      notes = excluded.notes,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      updated_at = CURRENT_TIMESTAMP
  `, [
    animeId,
    userItem.watch_status,
    userItem.favorite,
    userItem.user_score,
    userItem.episodes_watched,
    userItem.notes,
    userItem.started_at,
    userItem.completed_at
  ]);
}
