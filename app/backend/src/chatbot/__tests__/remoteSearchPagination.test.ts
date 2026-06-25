import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  continueRemoteAnimeSearch,
  previousRemoteAnimeSearch,
  showRemoteAnimeSearchPage,
  startRemoteAnimeSearch
} from '../remoteSearchPagination';
import { searchOnlinePage } from '../onlineAnimeSearch';
import * as db from '../../database/db';

const memoryStore = new Map<string, unknown>();

vi.mock('../../database/db', () => ({
  DB_PATH: process.cwd() + '/tmp/maplevault-remote-pagination.sqlite',
  query: {
    run: vi.fn(),
    all: vi.fn(),
    get: vi.fn()
  }
}));

vi.mock('../onlineAnimeSearch', () => ({
  searchOnlinePage: vi.fn()
}));

function buildRemotePage(page: number, total = 25, totalPages = 5) {
  return {
    items: Array.from({ length: 6 }, (_, index) => ({
      external_id: (page - 1) * 6 + index + 1,
      title: `Remoto ${(page - 1) * 6 + index + 1}`
    })),
    provider: 'anilist' as const,
    page,
    pageSize: 6,
    total,
    totalPages,
    hasMore: page < totalPages,
    available: true
  };
}

describe('Maple Assistant - paginación remota conversacional', () => {
  beforeEach(() => {
    memoryStore.clear();
    vi.clearAllMocks();

    (db.query.run as any).mockImplementation((sql: string, params?: unknown[]) => {
      if (String(sql).includes('INSERT INTO assistant_memory') && params?.[0]) {
        memoryStore.set(String(params[0]), JSON.parse(String(params[1])));
      }
      return Promise.resolve(undefined);
    });

    (db.query.get as any).mockImplementation((sql: string, params?: unknown[]) => {
      if (String(sql).includes('assistant_memory') && params?.[0]) {
        const value = memoryStore.get(String(params[0]));
        return Promise.resolve(value === undefined ? null : { value: JSON.stringify(value) });
      }
      return Promise.resolve(null);
    });
  });

  it('inicia una búsqueda remota y persiste proveedor, consulta y página', async () => {
    (searchOnlinePage as any).mockResolvedValue(buildRemotePage(1));

    const response = await startRemoteAnimeSearch('naruto');
    const cursor = memoryStore.get('remote_search_cursor') as any;

    expect(response.visualData?.data).toMatchObject({
      page: 1,
      totalPages: 5,
      provider: 'AniList',
      remote: true
    });
    expect(cursor).toMatchObject({
      query: 'naruto',
      provider: 'anilist',
      page: 1,
      pageSize: 6
    });
    expect((memoryStore.get('last_search_results') as any).items[0].title).toBe('Remoto 1');
  });

  it('navega usando siempre el proveedor guardado', async () => {
    (searchOnlinePage as any)
      .mockResolvedValueOnce(buildRemotePage(1))
      .mockResolvedValueOnce(buildRemotePage(2))
      .mockResolvedValueOnce(buildRemotePage(1));

    await startRemoteAnimeSearch('naruto');
    const second = await continueRemoteAnimeSearch();
    const previous = await previousRemoteAnimeSearch();

    expect(second.visualData?.data.page).toBe(2);
    expect(previous.visualData?.data.page).toBe(1);
    expect((searchOnlinePage as any).mock.calls[1]).toEqual(['naruto', 2, 6, 'anilist']);
    expect((searchOnlinePage as any).mock.calls[2]).toEqual(['naruto', 1, 6, 'anilist']);
  });

  it('limita a veinte páginas aunque el proveedor informe más', async () => {
    (searchOnlinePage as any).mockResolvedValue(buildRemotePage(1, 900, 150));

    const response = await startRemoteAnimeSearch('anime');
    const cursor = memoryStore.get('remote_search_cursor') as any;

    expect(response.visualData?.data.totalPages).toBe(20);
    expect(response.visualData?.data.total).toBe(120);
    expect(cursor.totalPages).toBe(20);
  });

  it('rechaza saltos fuera del rango sin consultar la fuente', async () => {
    (searchOnlinePage as any).mockResolvedValue(buildRemotePage(1));
    await startRemoteAnimeSearch('naruto');
    vi.clearAllMocks();

    const response = await showRemoteAnimeSearchPage(99);

    expect(response.text).toContain('no existe');
    expect(searchOnlinePage).not.toHaveBeenCalled();
  });

  it('conserva el cursor cuando el proveedor falla durante la navegación', async () => {
    (searchOnlinePage as any)
      .mockResolvedValueOnce(buildRemotePage(1))
      .mockResolvedValueOnce({
        ...buildRemotePage(2),
        items: [],
        available: false
      });

    await startRemoteAnimeSearch('naruto');
    const response = await continueRemoteAnimeSearch();

    expect(response.text).toContain('no respondió');
    expect((memoryStore.get('remote_search_cursor') as any).page).toBe(1);
  });
});
