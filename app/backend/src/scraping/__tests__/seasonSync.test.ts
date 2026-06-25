import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSeasonFromAniList } from '../scraper';

vi.mock('axios');

const mockedAxios = vi.mocked(axios);

function media(id: number, title: string) {
  return {
    id,
    title: { romaji: title, english: title, native: title },
    seasonYear: 2026,
    season: 'SUMMER',
    status: 'FINISHED',
    format: 'TV',
    genres: []
  };
}

describe('syncSeasonFromAniList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recorre todas las páginas y elimina duplicados por ID', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          data: {
            Page: {
              pageInfo: { hasNextPage: true },
              media: [media(1, 'Uno'), media(2, 'Dos')]
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            Page: {
              pageInfo: { hasNextPage: false },
              media: [media(2, 'Dos'), media(3, 'Tres')]
            }
          }
        }
      });

    const results = await syncSeasonFromAniList(2026, 'summer');

    expect(results.map(result => result.external_id)).toEqual([1, 2, 3]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'https://graphql.anilist.co',
      expect.objectContaining({
        variables: { year: 2026, season: 'SUMMER', page: 2 }
      }),
      expect.objectContaining({ timeout: 8000, maxRedirects: 0 })
    );
  });
});
