export interface AddAnimeActionPayload {
  title: string;
  watch_status?: string;
  [key: string]: unknown;
}

export interface AnimeIdActionPayload {
  animeId: number;
  title?: string;
}

export interface UpdateStatusActionPayload extends AnimeIdActionPayload {
  watchStatus: string;
}

export interface UpdateScoreActionPayload extends AnimeIdActionPayload {
  userScore: number;
}

export interface BatchUpdateStatusActionPayload {
  animeIds: number[];
  status: string;
  markEpisodesWatched?: boolean;
  seasons?: number[];
  title?: string;
}

export interface MarkWatchedActionPayload extends AnimeIdActionPayload {
  episodeNumber: number;
  watched?: boolean;
}

export interface ResolveDuplicatesActionPayload {
  title: string;
}

export interface ChatbotActionPayloadMap {
  add_anime: AddAnimeActionPayload;
  resolve_duplicates: ResolveDuplicatesActionPayload;
  update_status: UpdateStatusActionPayload;
  update_score: UpdateScoreActionPayload;
  remove_from_list: AnimeIdActionPayload;
  clear_user_list: Record<string, never>;
  mark_watched: MarkWatchedActionPayload;
  mark_all_watched: Record<string, unknown>;
  batch_update_status: BatchUpdateStatusActionPayload;
  delete_anime: AnimeIdActionPayload;
  sync_all: Record<string, unknown>;
}
