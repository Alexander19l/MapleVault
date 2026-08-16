export type MangaStatus = 'finished' | 'releasing' | 'hiatus' | 'cancelled' | 'not_yet_released' | 'unknown';
export type MangaFormat = 'manga' | 'manhwa' | 'manhua' | 'novel' | 'one_shot' | 'doujinshi' | 'webtoon' | 'unknown';
export type MangaReadStatus = 'reading' | 'plan_to_read' | 'completed' | 'dropped' | 'on_hold';

export interface MangaRow {
  id: number;
  external_id?: number | null;
  mal_id?: number | null;
  source?: string | null;
  title: string;
  title_romaji?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  synopsis?: string | null;
  year?: number | null;
  status?: MangaStatus | string | null;
  format?: MangaFormat | string | null;
  chapters?: number | null;
  volumes?: number | null;
  score?: number | null;
  popularity?: number | null;
  cover_image?: string | null;
  banner_image?: string | null;
  author?: string | null;
  artist?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  official_url?: string | null;
  is_adult?: number | null;
  genres?: string[];
  read_status?: MangaReadStatus | string | null;
  favorite?: number | null;
  user_score?: number | null;
  chapters_read?: number | null;
  volumes_read?: number | null;
  notes?: string | null;
}

export interface MangaListFilters {
  q?: string;
  status?: string;
  format?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  withTotal?: boolean;
}
