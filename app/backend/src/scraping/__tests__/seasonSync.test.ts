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

  it('reintenta una página cuando AniList responde 429 y respeta la espera', async () => {
    const rateLimitError: any = new Error('Too many requests');
    rateLimitError.response = {
      status: 429,
      headers: { 'retry-after': '2' }
    };
    mockedAxios.post
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        data: {
          data: {
            Page: {
              pageInfo: { hasNextPage: false },
              media: [media(5, 'Recuperado')]
            }
          }
        }
      });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    const results = await syncSeasonFromAniList(2026, 'summer', {
      requestDelayMs: 1500,
      maxRetries: 2,
      sleep,
      onRetry
    });

    expect(results.map(result => result.external_id)).toEqual([5]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5000);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      status: 429,
      delayMs: 5000
    }));
  });

  it('propaga el error después de agotar reintentos en vez de devolver una temporada vacía', async () => {
    const rateLimitError: any = new Error('Too many requests');
    rateLimitError.response = { status: 429 };
    mockedAxios.post.mockRejectedValue(rateLimitError);

    await expect(syncSeasonFromAniList(2026, 'summer', {
      maxRetries: 1,
      sleep: async () => undefined
    })).rejects.toThrow('Too many requests');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
