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

  it('tolera el sufijo editorial Mini usado por AnimeAV1', () => {
    expect(isAnimeTitleMatch(
      ['Super no Ura de Yani Suu Futari'],
      'Super no Ura de Yani Suu Futari Mini'
    )).toBe(true);
  });

  it('tolera diferencias de espaciado sin relajar las palabras del título', () => {
    expect(isAnimeTitleMatch(
      ['Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo'],
      'Kimi no Koto ga Daidaidaidaidaisuki na 100-nin no Kanojo'
    )).toBe(true);
  });

  it('normaliza el separador tipográfico y Cour como Part', () => {
    expect(isAnimeTitleMatch(
      ['SPY×FAMILY Part 2', 'SPY x FAMILY Cour 2'],
      'Spy x Family Part 2'
    )).toBe(true);
  });

  it('normaliza ordinales equivalentes sin mezclar temporadas distintas', () => {
    expect(normalizeAnimeTitle('Boku no Hero Academia 2nd Season'))
      .toBe(normalizeAnimeTitle('Boku no Hero Academia Season 2'));
    expect(normalizeAnimeTitle('Boku no Hero Academia 2'))
      .toBe(normalizeAnimeTitle('Boku no Hero Academia 2nd Season'));
    expect(isAnimeTitleMatch(
      ['Boku no Hero Academia 2nd Season'],
      'Boku no Hero Academia Season 3'
    )).toBe(false);
  });

  it('rechaza la serie base cuando el alias corresponde a una temporada posterior', () => {
    expect(isAnimeTitleMatch(
      ['My Hero Academia Season 2', 'Boku no Hero Academia 2'],
      'Boku no Hero Academia'
    )).toBe(false);
  });

  it('aplica la temporada detectada aunque otro alias haya perdido el sufijo', () => {
    const match = findBestAnimeTitleMatch(
      ['Example Saga', 'Example Saga Season 2'],
      [
        { slug: 'example-saga', title: 'Example Saga' },
        { slug: 'example-saga-2nd-season', title: 'Example Saga 2nd Season' }
      ]
    );

    expect(match?.candidate.slug).toBe('example-saga-2nd-season');
  });

  it.each([2, 3, 4, 5, 6, 7])(
    'elige la temporada %i de Boku no Hero aunque la serie base aparezca primero',
    season => {
      const suffix = season === 2 ? '2nd' : season === 3 ? '3rd' : `${season}th`;
      const match = findBestAnimeTitleMatch(
        [`My Hero Academia Season ${season}`, `Boku no Hero Academia ${season}`],
        [
          {
            slug: 'boku-no-hero-academia',
            title: 'Boku no Hero Academia'
          },
          {
            slug: `boku-no-hero-academia-${suffix}-season`,
            title: `Boku no Hero Academia ${suffix} Season`
          }
        ]
      );

      expect(match?.candidate.slug).toBe(`boku-no-hero-academia-${suffix}-season`);
      expect(match?.score).toBe(1);
    }
  );
});
