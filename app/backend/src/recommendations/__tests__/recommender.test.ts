import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalRecommendations } from '../recommender';
import * as db from '../../database/db';

vi.mock('../../database/db', () => ({
  DB_PATH: process.cwd() + '/tmp/maplevault-recommender.sqlite',
  query: {
    run: vi.fn(),
    all: vi.fn(),
    get: vi.fn()
  }
}));

describe('recomendaciones locales optimizadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resuelve el perfil y los candidatos con tres consultas acotadas', async () => {
    (db.query.all as any)
      .mockResolvedValueOnce([
        { anime_id: 1, user_score: 9, favorite: 1, studio: 'MAPPA' }
      ])
      .mockResolvedValueOnce([
        { anime_id: 1, name: 'Action' },
        { anime_id: 1, name: 'Drama' }
      ])
      .mockResolvedValueOnce([
        {
          id: 20,
          title: 'Candidate',
          cover_image: '',
          studio: 'MAPPA',
          score: 8.5,
          popularity: 1000,
          genres_joined: 'Action,Fantasy'
        }
      ]);

    const result = await getLocalRecommendations();

    expect(db.query.all).toHaveBeenCalledTimes(3);
    expect(String((db.query.all as any).mock.calls[2][0])).toContain('LIMIT 2000');
    expect(result[0]).toMatchObject({
      id: 20,
      genres: ['Action', 'Fantasy']
    });
    expect(result[0].reason).toContain('MAPPA');
  });

  it('obtiene recomendaciones iniciales y géneros en una sola consulta', async () => {
    (db.query.all as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 30,
          title: 'Top Anime',
          cover_image: '',
          studio: 'Bones',
          score: 9,
          genres_joined: 'Action,Comedy'
        }
      ]);

    const result = await getLocalRecommendations();

    expect(db.query.all).toHaveBeenCalledTimes(2);
    expect(result[0].genres).toEqual(['Action', 'Comedy']);
  });
});
