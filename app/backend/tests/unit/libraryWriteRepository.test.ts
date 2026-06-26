import { describe, expect, it, vi } from 'vitest';
import {
  clearCatalogData,
  createAnimeWithGenres,
  deleteAnimeById,
  deleteUserListEntry,
  getUserListEntryForUpdate,
  updateAnimeWithGenres,
  updateUserListEntry,
  upsertUserListEntry
} from '../../src/routes/libraryWriteRepository';

function createQueryClient() {
  return {
    get: vi.fn(),
    run: vi.fn().mockResolvedValue({ lastID: 1, changes: 1 })
  };
}

describe('Library write repository', () => {
  it('crea anime y vincula generos', async () => {
    const queryClient = createQueryClient();
    queryClient.run.mockResolvedValueOnce({ lastID: 42, changes: 1 });
    queryClient.get.mockResolvedValue({ id: 5 });

    const id = await createAnimeWithGenres(queryClient, {
      title: 'Manual Maple',
      year: 2026,
      season: 'winter',
      status: 'finished',
      type: 'tv',
      genres: ['Action']
    });

    expect(id).toBe(42);
    expect(queryClient.run.mock.calls[0][0]).toContain('INSERT INTO anime');
    expect(queryClient.run.mock.calls[0][1]).toContain('Manual Maple');
    expect(queryClient.run).toHaveBeenCalledWith('INSERT OR IGNORE INTO genres (name) VALUES (?)', ['Action']);
    expect(queryClient.run).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)',
      [42, 5]
    );
  });

  it('actualiza anime existente y reemplaza generos', async () => {
    const queryClient = createQueryClient();
    queryClient.get
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce({ id: 3 });

    const updated = await updateAnimeWithGenres(queryClient, 9, {
      title: 'Updated Maple',
      type: 'movie',
      genres: ['Drama']
    });

    expect(updated).toBe(true);
    expect(queryClient.run.mock.calls[0][0]).toContain('UPDATE anime');
    expect(queryClient.run.mock.calls[0][1].at(-1)).toBe(9);
    expect(queryClient.run).toHaveBeenCalledWith('DELETE FROM anime_genres WHERE anime_id = ?', [9]);
    expect(queryClient.run).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)',
      [9, 3]
    );
  });

  it('no actualiza anime inexistente', async () => {
    const queryClient = createQueryClient();
    queryClient.get.mockResolvedValueOnce(null);

    await expect(updateAnimeWithGenres(queryClient, 404, { title: 'Missing' })).resolves.toBe(false);
    expect(queryClient.run).not.toHaveBeenCalled();
  });

  it('limpia catalogo completo o conserva lista personal segun opcion', async () => {
    const fullClearClient = createQueryClient();
    await expect(clearCatalogData(fullClearClient, false)).resolves.toEqual({
      clearedAll: true,
      deletedCount: 0
    });
    expect(fullClearClient.run.mock.calls.map(call => call[0])).toEqual([
      'DELETE FROM anime',
      'DELETE FROM user_list',
      'DELETE FROM watched_episodes',
      'DELETE FROM anime_genres',
      'DELETE FROM anime_relations',
      'DELETE FROM genres'
    ]);

    const partialClearClient = createQueryClient();
    partialClearClient.run.mockResolvedValueOnce({ lastID: 0, changes: 7 });
    await expect(clearCatalogData(partialClearClient, true)).resolves.toEqual({
      clearedAll: false,
      deletedCount: 7
    });
    expect(partialClearClient.run.mock.calls[0][0]).toContain('DELETE FROM anime');
    expect(partialClearClient.run.mock.calls[1][0]).toContain('DELETE FROM genres');
    expect(partialClearClient.run.mock.calls[2][0]).toContain('DELETE FROM anime_relations');
  });

  it('gestiona altas, cambios y borrado de lista personal', async () => {
    const queryClient = createQueryClient();
    queryClient.get.mockResolvedValueOnce({ id: 4, watch_status: 'watching' });

    await upsertUserListEntry(queryClient, {
      anime_id: 10,
      watch_status: 'watching',
      favorite: 1,
      user_score: 8,
      episodes_watched: 2,
      notes: 'en curso'
    }, '2026-06-26');
    await expect(getUserListEntryForUpdate(queryClient, 4)).resolves.toEqual({ id: 4, watch_status: 'watching' });
    await updateUserListEntry(queryClient, 4, {
      watch_status: 'completed',
      favorite: 1,
      user_score: 9,
      episodes_watched: 12,
      notes: 'terminada'
    }, '2026-06-26');
    await deleteUserListEntry(queryClient, 4);
    await deleteAnimeById(queryClient, 10);

    expect(queryClient.run.mock.calls[0][0]).toContain('INSERT INTO user_list');
    expect(queryClient.run.mock.calls[0][1]).toEqual([
      10,
      'watching',
      1,
      8,
      2,
      'en curso',
      '2026-06-26'
    ]);
    expect(queryClient.run.mock.calls[1][0]).toContain('UPDATE user_list');
    expect(queryClient.run.mock.calls[1][1]).toEqual([
      'completed',
      1,
      9,
      12,
      'terminada',
      '2026-06-26',
      4
    ]);
    expect(queryClient.run.mock.calls[2]).toEqual(['DELETE FROM user_list WHERE id = ?', [4]]);
    expect(queryClient.run.mock.calls[3]).toEqual(['DELETE FROM anime WHERE id = ?', [10]]);
  });
});
