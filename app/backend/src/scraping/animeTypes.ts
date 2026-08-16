export interface NormalizedAnime {
  external_id: number;
  mal_id?: number;
  source: string;
  title: string;
  title_romaji?: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  year?: number;
  season?: string;
  status?: string;
  type?: string;
  episodes?: number;
  duration?: number;
  score?: number;
  popularity?: number;
  cover_image?: string;
  banner_image?: string;
  studio?: string;
  source_material?: string;
  age_rating?: string;
  start_date?: string;
  end_date?: string;
  genres: string[];
  official_url?: string;
  is_adult?: number;
  relations?: {
    related_external_id: number;
    relation_type: string;
    title: string;
    format?: string;
    type?: string;
    status?: string;
    cover_image?: string;
  }[];
}

export interface ExternalSearchPage {
  items: NormalizedAnime[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  available: boolean;
}

export interface ExternalSearchOptions {
  page?: number;
  perPage?: number;
}
