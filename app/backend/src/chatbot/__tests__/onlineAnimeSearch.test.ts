import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOnlineSearchCache,
  searchOnlinePage
} from '../onlineAnimeSearch';
import * as scraper from '../../scraping/scraper';

vi.mock('../../scraping/scraper', () => ({
  searchAniList: vi.fn(),
  searchJikan: vi.fn(),
  searchAniListPage: vi.fn(),
  searchJikanPage: vi.fn()
}));

vi.mock('../../translation/translationService', () => ({
  decorateAnimeListWithSpanishTranslation: vi.fn(async (rows: any[]) => rows)
}));

describe('Maple Assistant - adaptador paginado de fuentes online', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOnlineSearchCache();
  });

  it('usa AniList como fuente primaria y conserva sus metadatos de página', async () => {
    (scraper.searchAniListPage as any).mockResolvedValue({
      items: [{ external_id: 1, title: 'Naruto', source: 'AniList', genres: ['Action'] }],
      page: 2,
      pageSize: 6,
      total: 41,
      totalPages: 7,
      hasNextPage: true,
      available: true
    });

    const result = await searchOnlinePage('naruto', 2, 6);

    expect(result).toMatchObject({
      provider: 'anilist',
      page: 2,
      pageSize: 6,
      total: 41,
      totalPages: 7,
      hasMore: true
    });
    expect(scraper.searchJikanPage).not.toHaveBeenCalled();
  });

  it('usa Jikan como fallback cuando AniList no devuelve resultados', async () => {
    (scraper.searchAniListPage as any).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 6,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      available: true
    });
    (scraper.searchJikanPage as any).mockResolvedValue({
      items: [{ external_id: 2, title: 'Fallback', source: 'MyAnimeList', genres: [] }],
      page: 1,
      pageSize: 6,
      total: 9,
      totalPages: 2,
      hasNextPage: true,
      available: true
    });

    const result = await searchOnlinePage('fallback', 1, 6);

    expect(result.provider).toBe('jikan');
    expect(result.items[0].title).toBe('Fallback');
    expect(scraper.searchJikanPage).toHaveBeenCalledTimes(1);
  });

  it('mantiene el proveedor solicitado durante la navegación', async () => {
    (scraper.searchJikanPage as any).mockResolvedValue({
      items: [{ external_id: 3, title: 'Página Jikan', source: 'MyAnimeList', genres: [] }],
      page: 3,
      pageSize: 6,
      total: 20,
      totalPages: 4,
      hasNextPage: true,
      available: true
    });

    const result = await searchOnlinePage('query', 3, 6, 'jikan');

    expect(result.provider).toBe('jikan');
    expect(scraper.searchAniListPage).not.toHaveBeenCalled();
  });

  it('reutiliza durante cinco minutos una página ya consultada', async () => {
    (scraper.searchAniListPage as any).mockResolvedValue({
      items: [{ external_id: 4, title: 'Cache', source: 'AniList', genres: [] }],
      page: 1,
      pageSize: 6,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      available: true
    });

    await searchOnlinePage('cache', 1, 6);
    await searchOnlinePage('cache', 1, 6);

    expect(scraper.searchAniListPage).toHaveBeenCalledTimes(1);
  });
});
