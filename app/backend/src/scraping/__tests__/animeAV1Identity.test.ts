import { describe, expect, it } from 'vitest';
import { validateAnimeAV1Identity } from '../animeAV1Identity';

const tvCategory = { name: 'TV Anime', slug: 'tv-anime' };

describe('identidad segura de series de AnimeAV1', () => {
  it('rechaza otra temporada aunque el nombre de la franquicia sea parecido', () => {
    const validation = validateAnimeAV1Identity({
      external_id: 117193,
      source: 'AniList',
      mal_id: 41587,
      title: 'My Hero Academia Season 5',
      title_romaji: 'Boku no Hero Academia 5',
      year: 2021,
      type: 'tv'
    }, {
      title: 'Boku no Hero Academia',
      malId: 31964,
      startDate: '2016-04-03',
      category: tvCategory
    });

    expect(validation).toMatchObject({ matches: false, reason: 'mal_id_mismatch' });
  });

  it('rechaza una temporada anterior de la misma saga', () => {
    const validation = validateAnimeAV1Identity({
      external_id: 185874,
      source: 'AniList',
      mal_id: 60636,
      title: 'BLEACH: Thousand-Year Blood War - The Calamity',
      year: 2026,
      type: 'tv'
    }, {
      title: 'Bleach: Sennen Kessen-hen',
      malId: 41467,
      startDate: '2022-10-11',
      category: tvCategory
    });

    expect(validation).toMatchObject({ matches: false, reason: 'mal_id_mismatch' });
  });

  it('rechaza otra obra con un titulo parcialmente similar', () => {
    const validation = validateAnimeAV1Identity({
      external_id: 210031,
      source: 'AniList',
      mal_id: 63832,
      title: 'You and I Are Polar Opposites Season 2',
      title_romaji: 'Seihantai na Kimi to Boku 2nd Season',
      year: 2026,
      type: 'tv'
    }, {
      title: 'Kimi to Boku. 2',
      malId: 11739,
      startDate: '2012-04-03',
      category: tvCategory
    });

    expect(validation).toMatchObject({ matches: false, reason: 'mal_id_mismatch' });
  });

  it('acepta un sufijo editorial de AnimeAV1 cuando el MAL ID es identico', () => {
    const validation = validateAnimeAV1Identity({
      external_id: 196187,
      source: 'AniList',
      mal_id: 62076,
      title: 'Smoking Behind the Supermarket with You',
      title_romaji: 'Super no Ura de Yani Suu Futari',
      year: 2026,
      type: 'tv'
    }, {
      title: 'Super no Ura de Yani Suu Futari Mini',
      malId: 62076,
      startDate: '2026-06-03',
      category: tvCategory
    });

    expect(validation).toMatchObject({ matches: true, reason: 'mal_id_match' });
  });

  it('usa ano y formato como respaldo si no hay IDs oficiales', () => {
    expect(validateAnimeAV1Identity({
      title: 'Example Series',
      year: 2025,
      type: 'tv'
    }, {
      title: 'Example Series',
      malId: null,
      startDate: '2024-01-01',
      category: tvCategory
    })).toMatchObject({ matches: false, reason: 'year_mismatch' });

    expect(validateAnimeAV1Identity({
      title: 'Example Series',
      year: 2025,
      type: 'movie'
    }, {
      title: 'Example Series',
      malId: null,
      startDate: '2025-01-01',
      category: tvCategory
    })).toMatchObject({ matches: false, reason: 'type_mismatch' });
  });

  it('falla cerrado si solo existe una coincidencia textual', () => {
    expect(validateAnimeAV1Identity({
      title: 'Example Series'
    }, {
      title: 'Example Series',
      malId: null,
      startDate: null,
      category: null
    })).toMatchObject({ matches: false, reason: 'insufficient_metadata' });
  });
});
