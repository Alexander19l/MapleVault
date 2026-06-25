import { describe, expect, it } from 'vitest';
import { normalizeAniListRelations } from '../scraper';

describe('Relaciones de anime de AniList', () => {
  it('conserva únicamente precuelas y secuelas cuyo medio es anime', () => {
    const relations = normalizeAniListRelations([
      {
        relationType: 'PREQUEL',
        node: {
          id: 1,
          type: 'ANIME',
          format: 'TV',
          title: { english: 'Anime Prequel' }
        }
      },
      {
        relationType: 'SEQUEL',
        node: {
          id: 2,
          type: 'MANGA',
          format: 'MANGA',
          title: { english: 'Manga Sequel' }
        }
      },
      {
        relationType: 'ADAPTATION',
        node: {
          id: 3,
          type: 'ANIME',
          format: 'TV',
          title: { english: 'Anime Adaptation' }
        }
      },
      {
        relationType: 'SEQUEL',
        node: {
          id: 4,
          type: 'ANIME',
          format: 'MOVIE',
          title: { romaji: 'Anime Sequel' }
        }
      }
    ]);

    expect(relations).toHaveLength(2);
    expect(relations.map(relation => relation.related_external_id)).toEqual([1, 4]);
    expect(relations.every(relation => relation.type === 'ANIME')).toBe(true);
    expect(relations.map(relation => relation.relation_type)).toEqual(['PREQUEL', 'SEQUEL']);
  });
});
