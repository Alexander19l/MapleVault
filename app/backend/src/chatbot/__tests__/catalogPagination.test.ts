import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleCatalogPage,
  handleContinueCatalog,
  handlePreviousCatalog,
  handleViewCatalog
} from '../catalogCommandHandler';
import * as db from '../../database/db';

const memoryStore = new Map<string, unknown>();

vi.mock('../../database/db', () => ({
  DB_PATH: process.cwd() + '/tmp/maplevault-catalog-pagination.sqlite',
  query: {
    run: vi.fn(),
    all: vi.fn(),
    get: vi.fn()
  }
}));

vi.mock('../../translation/translationService', () => ({
  decorateAnimeListWithSpanishTranslation: vi.fn(async (rows: any[]) => rows)
}));

describe('Maple Assistant - paginación conversacional del catálogo', () => {
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
      if (String(sql).includes('COUNT(*) as count')) {
        return Promise.resolve({ count: 18 });
      }
      return Promise.resolve(null);
    });

    (db.query.all as any).mockImplementation((sql: string, params: unknown[] = []) => {
      if (!String(sql).includes('LIMIT ? OFFSET ?')) return Promise.resolve([]);
      const limit = Number(params.at(-2));
      const offset = Number(params.at(-1));
      const remaining = Math.max(0, 18 - offset);
      return Promise.resolve(Array.from({ length: Math.min(limit, remaining) }, (_, index) => ({
        id: offset + index + 1,
        title: `Serie ${offset + index + 1}`,
        updated_at: '2026-01-01'
      })));
    });
  });

  it('entrega la primera página y persiste el siguiente desplazamiento', async () => {
    const response = await handleViewCatalog({});

    expect(response.visualData?.type).toBe('anime_page');
    expect(response.visualData?.data).toMatchObject({
      page: 1,
      totalPages: 3,
      total: 18,
      hasMore: true
    });
    expect(response.visualData?.data.items).toHaveLength(8);
    expect((memoryStore.get('catalog_cursor') as any).offset).toBe(8);
    expect((memoryStore.get('last_search_results') as any).items).toHaveLength(8);
  });

  it('continúa desde el cursor y conserva referencias solo de la página visible', async () => {
    await handleViewCatalog({});
    const response = await handleContinueCatalog();

    expect(response.visualData?.data.page).toBe(2);
    expect(response.visualData?.data.items[0].title).toBe('Serie 9');
    expect(response.visualData?.data.items).toHaveLength(8);
    expect((memoryStore.get('catalog_cursor') as any).offset).toBe(16);
    expect((memoryStore.get('last_search_results') as any).items[0].title).toBe('Serie 9');
  });

  it('marca la última página y evita ofrecer otra continuación', async () => {
    await handleViewCatalog({});
    await handleContinueCatalog();
    const response = await handleContinueCatalog();

    expect(response.visualData?.data).toMatchObject({
      page: 3,
      totalPages: 3,
      hasMore: false
    });
    expect(response.visualData?.data.items).toHaveLength(2);

    const exhausted = await handleContinueCatalog();
    expect(exhausted.text).toContain('Ya viste las 18 series');
  });

  it('explica cómo iniciar cuando no existe un cursor reciente', async () => {
    const response = await handleContinueCatalog();
    expect(response.text).toContain('mi catálogo');
    expect(response.visualData).toBeUndefined();
  });

  it('permite saltar a una página y regresar sin perder los filtros del catálogo', async () => {
    await handleViewCatalog({ genre: 'action' });
    const third = await handleCatalogPage(3);
    const previous = await handlePreviousCatalog();

    expect(third.visualData?.data).toMatchObject({
      page: 3,
      hasPrevious: true,
      hasMore: false
    });
    expect(third.visualData?.data.items[0].title).toBe('Serie 17');
    expect(previous.visualData?.data).toMatchObject({
      page: 2,
      hasPrevious: true,
      hasMore: true
    });
    expect((memoryStore.get('catalog_cursor') as any).filters.genres).toEqual(['action']);
    expect((memoryStore.get('last_search_results') as any).items[0].title).toBe('Serie 9');
  });

  it('rechaza páginas fuera del rango del catálogo', async () => {
    await handleViewCatalog({});
    const response = await handleCatalogPage(99);

    expect(response.text).toContain('no existe');
    expect(response.visualData).toBeUndefined();
  });

  it('invalida resultados paginados anteriores al abrir el catálogo', async () => {
    memoryStore.set('paged_results_cursor', {
      createdAt: new Date().toISOString(),
      mode: 'search',
      label: 'Resultados anteriores',
      offset: 6,
      pageSize: 6,
      total: 12,
      items: [{ id: 1, title: 'Anterior' }],
      nextPrompt: 'ver más resultados'
    });

    await handleViewCatalog({});

    expect(memoryStore.get('paged_results_cursor')).toBeNull();
    expect(memoryStore.get('catalog_cursor')).toBeTruthy();
  });

  it('invalida una búsqueda remota anterior al abrir el catálogo', async () => {
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

    await handleViewCatalog({});

    expect(memoryStore.get('remote_search_cursor')).toBeNull();
    expect(memoryStore.get('catalog_cursor')).toBeTruthy();
  });
});
