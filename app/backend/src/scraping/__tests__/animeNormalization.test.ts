import { describe, expect, it } from 'vitest';
import {
  normalizeAniListMedia,
  normalizeAnimeStatus,
  normalizeAnimeType
} from '../animeNormalization';

describe('scraping/animeNormalization', () => {
  it.each([
    ['FINISHED', 'finished'],
    ['Currently Airing', 'airing'],
    ['NOT_YET_RELEASED', 'upcoming'],
    ['cancelled', 'cancelled'],
    [undefined, 'unknown']
  ])('normaliza estado %s', (input, expected) => {
    expect(normalizeAnimeStatus(input)).toBe(expected);
  });

  it.each([
    ['TV', 'tv'],
    ['TV_SPECIAL', 'tv'],
    ['MOVIE', 'movie'],
    ['OVA', 'ova'],
    ['ONA', 'ona'],
    ['SPECIAL', 'special'],
    [undefined, 'tv']
  ])('normaliza formato %s', (input, expected) => {
    expect(normalizeAnimeType(input)).toBe(expected);
  });

  it('convierte una ficha AniList sin conservar HTML ni relaciones manga', () => {
    const normalized = normalizeAniListMedia({
      id: 10,
      idMal: 20,
      title: { romaji: 'Serie Romaji', english: 'Series English' },
      description: '<p>Verified synopsis</p>',
      seasonYear: 2024,
      season: 'SPRING',
      status: 'FINISHED',
      format: 'TV',
      episodes: 12,
      averageScore: 85,
      startDate: { year: 2024, month: 4, day: 2 },
      genres: ['Comedy'],
      relations: {
        edges: [
          {
            relationType: 'SEQUEL',
            node: {
              id: 11,
              type: 'ANIME',
              title: { english: 'Series Sequel' }
            }
          },
          {
            relationType: 'ADAPTATION',
            node: {
              id: 12,
              type: 'MANGA',
              title: { english: 'Source Manga' }
            }
          }
        ]
      }
    });

    expect(normalized).toMatchObject({
      external_id: 10,
      mal_id: 20,
      source: 'AniList',
      title: 'Series English',
      synopsis: 'Verified synopsis',
      year: 2024,
      season: 'spring',
      status: 'finished',
      type: 'tv',
      score: 8.5,
      start_date: '2024-04-02'
    });
    expect(normalized.relations).toHaveLength(1);
    expect(normalized.relations?.[0].related_external_id).toBe(11);
  });
});
