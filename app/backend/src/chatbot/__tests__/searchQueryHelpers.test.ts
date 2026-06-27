import { describe, expect, it } from 'vitest';
import {
  buildSearchTextContext,
  getAnimeSearchOrderBy,
  hasAnimeSearchCriteria,
  uniqueLowercaseFilters
} from '../searchQueryHelpers';

describe('chatbot/searchQueryHelpers', () => {
  it('normaliza filtros lower-case y elimina duplicados', () => {
    expect(uniqueLowercaseFilters(['Cyberpunk', 'cyberpunk', '', 'Hacking'])).toEqual([
      'cyberpunk',
      'hacking'
    ]);
    expect(uniqueLowercaseFilters('cyberpunk')).toEqual([]);
  });

  it('construye texto local y fallback online desde entidades verificadas', () => {
    expect(buildSearchTextContext({ query: '  lain  ', genre: 'sci-fi' })).toEqual({
      queryText: 'lain',
      onlineQueryText: 'lain'
    });

    expect(buildSearchTextContext({ tags: ['cyberpunk', 'hacking'] })).toEqual({
      queryText: '',
      onlineQueryText: 'cyberpunk hacking'
    });
  });

  it('detecta criterios de busqueda por texto, tags o filtros avanzados', () => {
    expect(hasAnimeSearchCriteria({}, '', [], [])).toBe(false);
    expect(hasAnimeSearchCriteria({}, 'naruto', [], [])).toBe(true);
    expect(hasAnimeSearchCriteria({}, '', ['cyberpunk'], [])).toBe(true);
    expect(hasAnimeSearchCriteria({ max_episodes: 13 }, '', [], [])).toBe(true);
  });

  it('resuelve ordenamiento permitido con fallback estable', () => {
    expect(getAnimeSearchOrderBy('score_asc')).toBe('a.score ASC, a.popularity DESC, a.id DESC');
    expect(getAnimeSearchOrderBy('release_date_desc')).toBe('a.year DESC, a.start_date DESC, a.id DESC');
    expect(getAnimeSearchOrderBy(undefined)).toBe('a.popularity DESC, a.score DESC, a.id DESC');
  });
});
