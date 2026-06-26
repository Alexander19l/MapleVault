import { describe, expect, it, vi } from 'vitest';
import {
  getAnimeRelations,
  getAnimeWithUserStateAndGenres,
  getDuplicateAnimeGroups,
  getGenreNames,
  getLocalAnimeRowsByExternalIds,
  getUserListRows
} from '../../src/routes/libraryReadRepository';

describe('Library read repository', () => {
  it('obtiene ficha local con estado de usuario y generos', async () => {
    const queryClient = {
      get: vi.fn().mockResolvedValueOnce({ id: 7, title: 'Maple', watch_status: 'watching' }),
      all: vi.fn().mockResolvedValueOnce([{ name: 'Action' }, { name: 'Comedy' }])
    };

    const anime = await getAnimeWithUserStateAndGenres(queryClient, 7);

    expect(anime).toEqual({
      id: 7,
      title: 'Maple',
      watch_status: 'watching',
      genres: ['Action', 'Comedy']
    });
    expect(queryClient.get.mock.calls[0][1]).toEqual([7]);
    expect(queryClient.all.mock.calls[0][1]).toEqual([7]);
  });

  it('devuelve null si la ficha local no existe', async () => {
    const queryClient = {
      get: vi.fn().mockResolvedValueOnce(null),
      all: vi.fn()
    };

    await expect(getAnimeWithUserStateAndGenres(queryClient, 99)).resolves.toBeNull();
    expect(queryClient.all).not.toHaveBeenCalled();
  });

  it('filtra relaciones a precuelas y secuelas anime', async () => {
    const queryClient = {
      get: vi.fn(),
      all: vi.fn().mockResolvedValueOnce([{ relation_type: 'SEQUEL', type: 'ANIME' }])
    };

    const rows = await getAnimeRelations(queryClient, 5);

    expect(rows).toEqual([{ relation_type: 'SEQUEL', type: 'ANIME' }]);
    expect(queryClient.all.mock.calls[0][0]).toContain("IN ('PREQUEL', 'SEQUEL')");
    expect(queryClient.all.mock.calls[0][0]).toContain("= 'ANIME'");
    expect(queryClient.all.mock.calls[0][1]).toEqual([5]);
  });

  it('construye consulta de lista personal con filtros opcionales', async () => {
    const queryClient = {
      get: vi.fn(),
      all: vi.fn().mockResolvedValueOnce([{ id: 1, title: 'Maple' }])
    };

    const rows = await getUserListRows(queryClient, { status: 'completed', favorite: '1' });

    expect(rows).toEqual([{ id: 1, title: 'Maple' }]);
    expect(queryClient.all.mock.calls[0][0]).toContain('ul.watch_status = ?');
    expect(queryClient.all.mock.calls[0][0]).toContain('ul.favorite = ?');
    expect(queryClient.all.mock.calls[0][1]).toEqual(['completed', 1]);
  });

  it('lista generos y resuelve ids locales por external_id', async () => {
    const queryClient = {
      get: vi.fn(),
      all: vi.fn()
        .mockResolvedValueOnce([{ name: 'Action' }, { name: 'Romance' }])
        .mockResolvedValueOnce([{ id: 3, external_id: 100 }])
    };

    await expect(getGenreNames(queryClient)).resolves.toEqual(['Action', 'Romance']);
    await expect(getLocalAnimeRowsByExternalIds(queryClient, [100])).resolves.toEqual([{ id: 3, external_id: 100 }]);
    await expect(getLocalAnimeRowsByExternalIds(queryClient, [])).resolves.toEqual([]);
    expect(queryClient.all.mock.calls[1][0]).toContain('external_id IN (?)');
    expect(queryClient.all).toHaveBeenCalledTimes(2);
  });

  it('normaliza grupos duplicados para respuesta publica', async () => {
    const queryClient = {
      get: vi.fn(),
      all: vi.fn().mockResolvedValueOnce([
        {
          normalized_title: 'maple',
          year: 2026,
          count: 2,
          ids: '1,2',
          sources: 'AniList,Jikan'
        }
      ])
    };

    await expect(getDuplicateAnimeGroups(queryClient)).resolves.toEqual([
      {
        normalized_title: 'maple',
        year: 2026,
        count: 2,
        ids: [1, 2],
        sources: ['AniList', 'Jikan']
      }
    ]);
  });
});
