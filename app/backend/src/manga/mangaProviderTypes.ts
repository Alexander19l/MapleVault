import type {
  MangaDexChapter,
  MangaDexChapterPages,
  MangaDexSearchItem
} from './mangadexProvider';

export interface MangaSearchFilters {
  genres?: string[];
  tags?: string[];
  status?: string;
  recent?: boolean;
}

export interface MangaTagOption {
  id: string;
  name: string;
  group: 'genre' | 'theme' | 'format' | 'other';
}

export interface MangaCatalogProvider {
  search(query: string, limit?: number, filters?: MangaSearchFilters): Promise<MangaDexSearchItem[]>;
  getDetails(mangaId: string): Promise<MangaDexSearchItem>;
  getChapters(mangaId: string, languages?: Array<'es' | 'en'>): Promise<MangaDexChapter[]>;
  getPages(chapterId: string, quality?: 'data' | 'data-saver'): Promise<MangaDexChapterPages>;
  downloadPages(pages: string[], quality?: 'data' | 'data-saver'): Promise<Buffer>;
  getRecent?(limit?: number): Promise<MangaDexSearchItem[]>;
  getTags?(): Promise<MangaTagOption[]>;
}
