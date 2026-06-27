import { describe, expect, it, vi } from 'vitest';
import {
  assertValidSlugColumn,
  getAnimeForSlugLookup,
  getAnimeSlug,
  getWatchedEpisodeNumbers,
  saveAnimeSlug,
  setEpisodeWatchedState
} from '../../src/routes/episodeRepository';

function createQueryClient() {
  return {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn().mockResolvedValue({ lastID: 0, changes: 1 })
  };
}

describe('Episode repository', () => {
  it('limita columnas de slug permitidas', () => {
    expect(() => assertValidSlugColumn('animeav1_slug')).not.toThrow();
    expect(() => assertValidSlugColumn('title; DROP TABLE anime;')).toThrow('Columna de slug no permitida.');
  });

  it('consulta anime para resolver slug y guarda slug validado', async () => {
    const queryClient = createQueryClient();
    queryClient.get.mockResolvedValueOnce({ id: 1, title: 'Maple', animeav1_slug: null });

    await expect(getAnimeForSlugLookup(queryClient, 1, 'animeav1_slug')).resolves.toEqual({
      id: 1,
      title: 'Maple',
      animeav1_slug: null
    });
    await saveAnimeSlug(queryClient, 1, 'animeav1_slug', 'maple-slug');

    expect(queryClient.get.mock.calls[0][0]).toContain('animeav1_slug FROM anime');
    expect(queryClient.get.mock.calls[0][1]).toEqual([1]);
    expect(queryClient.run).toHaveBeenCalledWith('UPDATE anime SET animeav1_slug = ? WHERE id = ?', ['maple-slug', 1]);
  });

  it('consulta slug simple de proveedor', async () => {
    const queryClient = createQueryClient();
    queryClient.get.mockResolvedValueOnce({ id: 2, tioanime_slug: 'maple-tio' });

    await expect(getAnimeSlug(queryClient, 2, 'tioanime_slug')).resolves.toEqual({ id: 2, tioanime_slug: 'maple-tio' });
    expect(queryClient.get.mock.calls[0][0]).toContain('tioanime_slug FROM anime');
  });

  it('lista capitulos vistos como numeros', async () => {
    const queryClient = createQueryClient();
    queryClient.all.mockResolvedValueOnce([{ episode_number: 1 }, { episode_number: 3 }]);

    await expect(getWatchedEpisodeNumbers(queryClient, 9)).resolves.toEqual([1, 3]);
    expect(queryClient.all).toHaveBeenCalledWith('SELECT episode_number FROM watched_episodes WHERE anime_id = ?', [9]);
  });

  it('marca y desmarca episodios vistos actualizando conteo de lista', async () => {
    const markClient = createQueryClient();
    markClient.get.mockResolvedValueOnce({ cnt: 4 });

    await expect(setEpisodeWatchedState(markClient, 9, 2, true)).resolves.toBe(4);
    expect(markClient.run.mock.calls[0]).toEqual([
      'INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)',
      [9, 2]
    ]);
    expect(markClient.run.mock.calls[1]).toEqual([
      'UPDATE user_list SET episodes_watched = ?, updated_at = CURRENT_TIMESTAMP WHERE anime_id = ?',
      [4, 9]
    ]);

    const unmarkClient = createQueryClient();
    unmarkClient.get.mockResolvedValueOnce({ cnt: 3 });

    await expect(setEpisodeWatchedState(unmarkClient, 9, 2, false)).resolves.toBe(3);
    expect(unmarkClient.run.mock.calls[0]).toEqual([
      'DELETE FROM watched_episodes WHERE anime_id = ? AND episode_number = ?',
      [9, 2]
    ]);
  });
});
