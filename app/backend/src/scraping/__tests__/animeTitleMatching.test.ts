import { describe, expect, it } from 'vitest';
import {
  findBestAnimeTitleMatch,
  isAnimeTitleMatch,
  normalizeAnimeTitle
} from '../animeTitleMatching';

describe('coincidencia segura de títulos para proveedores de episodios', () => {
  it('elige la serie principal aunque un spin-off comparta la franquicia', () => {
    const match = findBestAnimeTitleMatch(
      ['My Hero Academia', 'Boku no Hero Academia'],
      [
        {
          slug: 'vigilante-boku-no-hero-academia-illegals-2nd-season',
          title: 'Vigilante: Boku no Hero Academia Illegals 2nd Season'
        },
        {
          slug: 'boku-no-hero-academia',
          title: 'Boku no Hero Academia'
        }
      ]
    );

    expect(match?.candidate.slug).toBe('boku-no-hero-academia');
    expect(match?.score).toBe(1);
  });

  it('rechaza spin-offs y secuelas cuando solo coincide el nombre de la saga', () => {
    expect(isAnimeTitleMatch(
      ['My Hero Academia', 'Boku no Hero Academia'],
      'Vigilante: Boku no Hero Academia Illegals 2nd Season'
    )).toBe(false);
    expect(isAnimeTitleMatch(['Sword Art Online'], 'Sword Art Online II')).toBe(false);
  });

  it('no confunde una película de Mahouka con una temporada', () => {
    expect(isAnimeTitleMatch(
      [
        'The Irregular at Magic High School THE MOVIE -Yotsuba Succession Arc-',
        'Mahouka Koukou no Rettousei: Yotsuba Keishou-hen'
      ],
      'Mahouka Koukou no Rettousei 3rd Season'
    )).toBe(false);
  });

  it('tolera numeración editorial adicional cuando AV1 conserva el título distintivo', () => {
    expect(isAnimeTitleMatch(
      ['Boku no Hero Academia No. 170+1: More'],
      'Boku no Hero Academia: More'
    )).toBe(true);
  });

  it('normaliza ordinales equivalentes sin mezclar temporadas distintas', () => {
    expect(normalizeAnimeTitle('Boku no Hero Academia 2nd Season'))
      .toBe(normalizeAnimeTitle('Boku no Hero Academia Season 2'));
    expect(isAnimeTitleMatch(
      ['Boku no Hero Academia 2nd Season'],
      'Boku no Hero Academia Season 3'
    )).toBe(false);
  });
});
