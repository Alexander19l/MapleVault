import { describe, expect, it, vi } from 'vitest';
import { getCatalogAnimeRows } from '../../src/routes/libraryCatalogRepository';

describe('Library catalog repository', () => {
  it('aplica filtros, paginacion y total opcional', async () => {
    const queryClient = {
      all: vi.fn().mockResolvedValueOnce([{ id: 1, title: 'Maple' }]),
      get: vi.fn().mockResolvedValueOnce({ total: 12 })
    };

    const result = await getCatalogAnimeRows(queryClient, {
      q: 'maple',
      limit: 2,
      offset: 4,
      withTotal: true,
      sort: 'title'
    }, undefined);

    expect(result).toEqual({
      rows: [{ id: 1, title: 'Maple' }],
      total: 12,
      limit: 2,
      offset: 4
    });
    expect(queryClient.all.mock.calls[0][0]).toContain('a.title LIKE ?');
    expect(queryClient.all.mock.calls[0][0]).toContain('ORDER BY a.title ASC');
    expect(queryClient.all.mock.calls[0][0]).toContain('LIMIT ? OFFSET ?');
    expect(queryClient.all.mock.calls[0][1]).toEqual(['%maple%', '%maple%', '%maple%', 2, 4]);
    expect(queryClient.get.mock.calls[0][1]).toEqual(['%maple%', '%maple%', '%maple%']);
  });

  it('usa seleccion completa cuando se solicita sinopsis traducible', async () => {
    const queryClient = {
      all: vi.fn().mockResolvedValueOnce([{ id: 2, title: 'Full Maple', synopsis: 'Long text' }]),
      get: vi.fn()
    };

    const result = await getCatalogAnimeRows(queryClient, {
      translateSynopsis: true
    }, 'include');

    expect(result.rows).toEqual([{ id: 2, title: 'Full Maple', synopsis: 'Long text' }]);
    expect(queryClient.all.mock.calls[0][0]).toContain('SELECT a.*');
    expect(queryClient.get).not.toHaveBeenCalled();
  });
});
