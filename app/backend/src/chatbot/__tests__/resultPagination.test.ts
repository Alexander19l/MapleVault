import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  continuePagedAnimeResults,
  previousPagedAnimeResults,
  showPagedAnimeResultsPage,
  startPagedAnimeResults
} from '../resultPagination';
import * as db from '../../database/db';

const memoryStore = new Map<string, unknown>();

vi.mock('../../database/db', () => ({
  DB_PATH: process.cwd() + '/tmp/maplevault-result-pagination.sqlite',
  query: {
    run: vi.fn(),
    all: vi.fn(),
    get: vi.fn()
  }
}));

describe('Maple Assistant - paginación común de resultados', () => {
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

  it('pagina resultados y actualiza referencias por cada página visible', async () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      title: `Resultado ${index + 1}`
    }));

    const first = await startPagedAnimeResults({
      mode: 'search',
      label: 'Resultados de prueba',
      items
    });
    expect(first.visualData?.data).toMatchObject({
      page: 1,
      totalPages: 3,
      total: 14,
      hasMore: true
    });
    expect(first.visualData?.data.items).toHaveLength(6);

    const second = await continuePagedAnimeResults();
    expect(second.visualData?.data.page).toBe(2);
    expect(second.visualData?.data.items[0].title).toBe('Resultado 7');
    expect((memoryStore.get('last_search_results') as any).items[0].title).toBe('Resultado 7');

    const third = await continuePagedAnimeResults();
    expect(third.visualData?.data).toMatchObject({
      page: 3,
      hasMore: false
    });
    expect(third.visualData?.data.items).toHaveLength(2);
  });

  it('limita el contexto persistente a 32 resultados', async () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      title: `Resultado ${index + 1}`
    }));

    await startPagedAnimeResults({
      mode: 'recommendation',
      label: 'Recomendaciones',
      items
    });

    expect((memoryStore.get('paged_results_cursor') as any).items).toHaveLength(32);
    expect((memoryStore.get('paged_results_cursor') as any).total).toBe(32);
  });

  it('permite volver a la página anterior y actualiza las referencias visibles', async () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      title: `Resultado ${index + 1}`
    }));

    await startPagedAnimeResults({
      mode: 'search',
      label: 'Resultados',
      items
    });
    await continuePagedAnimeResults();
    const previous = await previousPagedAnimeResults();

    expect(previous.visualData?.data).toMatchObject({
      page: 1,
      hasPrevious: false,
      hasMore: true
    });
    expect(previous.visualData?.data.items[0].title).toBe('Resultado 1');
    expect((memoryStore.get('last_search_results') as any).items[1].title).toBe('Resultado 2');
  });

  it('salta directamente a una página válida y rechaza páginas inexistentes', async () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      title: `Resultado ${index + 1}`
    }));

    await startPagedAnimeResults({
      mode: 'recommendation',
      label: 'Recomendaciones',
      items
    });
    const third = await showPagedAnimeResultsPage(3);
    const invalid = await showPagedAnimeResultsPage(4);

    expect(third.visualData?.data).toMatchObject({
      page: 3,
      hasPrevious: true,
      hasMore: false
    });
    expect(third.visualData?.data.items[0].title).toBe('Resultado 13');
    expect(invalid.text).toContain('no existe');
    expect(invalid.visualData).toBeUndefined();
  });

  it('no retrocede antes de la primera página', async () => {
    await startPagedAnimeResults({
      mode: 'search',
      label: 'Resultados',
      items: [{ id: 1, title: 'Resultado 1' }]
    });

    const response = await previousPagedAnimeResults();
    expect(response.text).toContain('primera página');
  });

  it('invalida el cursor del catálogo al iniciar otros resultados', async () => {
    memoryStore.set('catalog_cursor', {
      createdAt: new Date().toISOString(),
      offset: 8,
      pageSize: 8,
      total: 20,
      filters: { genres: [] }
    });

    await startPagedAnimeResults({
      mode: 'search',
      label: 'Resultados',
      items: [{ id: 1, title: 'Resultado' }]
    });

    expect(memoryStore.get('catalog_cursor')).toBeNull();
    expect(memoryStore.get('paged_results_cursor')).toBeTruthy();
  });

  it('invalida una búsqueda remota al iniciar resultados locales', async () => {
    memoryStore.set('remote_search_cursor', {
      createdAt: new Date().toISOString(),
      query: 'naruto',
      label: 'Resultados online',
      provider: 'anilist',
      page: 1,
      pageSize: 6,
      total: 20,
      totalPages: 4,
      nextPrompt: 'ver más resultados'
    });

    await startPagedAnimeResults({
      mode: 'search',
      label: 'Resultados locales',
      items: [{ id: 1, title: 'Local' }]
    });

    expect(memoryStore.get('remote_search_cursor')).toBeNull();
  });

  it('informa cuando no existe contexto reciente', async () => {
    const response = await continuePagedAnimeResults();
    expect(response.text).toContain('No hay resultados recientes');
  });
});
