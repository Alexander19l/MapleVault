import type {
  MangaDexChapter,
  MangaDexChapterPages,
  MangaDexSearchItem
} from './mangadexProvider';

export interface MangaCatalogProvider {
  search(query: string, limit?: number): Promise<MangaDexSearchItem[]>;
  getDetails(mangaId: string): Promise<MangaDexSearchItem>;
  getChapters(mangaId: string, languages?: Array<'es' | 'en'>): Promise<MangaDexChapter[]>;
  getPages(chapterId: string, quality?: 'data' | 'data-saver'): Promise<MangaDexChapterPages>;
  downloadPages(pages: string[], quality?: 'data' | 'data-saver'): Promise<Buffer>;
}
