import { describe, expect, it } from 'vitest';
import {
  matchAnimeInfoFieldIntent,
  matchGeneralAnimeInfoIntent
} from '../intentAnimeInfoMatcher';
import { normalizeEntityText } from '../nlpText';

describe('chatbot/intentAnimeInfoMatcher', () => {
  it.each([
    ['info Death Note', 'death note'],
    ['dame info del 3', '3'],
    ['dime información sobre Steins;Gate', 'steins;gate'],
    ['qué sabes de Monster', 'monster'],
    ['show me details about Cowboy Bebop', 'cowboy bebop']
  ])('detecta informacion general: %s', (input, title) => {
    expect(matchGeneralAnimeInfoIntent(normalizeEntityText(input))).toEqual({
      intent: 'SHOW_ANIME_INFO',
      entities: {
        refIndexOrTitle: title,
        animeTitle: title
      }
    });
  });

  it.each([
    ['cuántos capítulos tiene Berserk', 'berserk', 'episodes'],
    ['cuándo salió Akira', 'akira', 'start_date'],
    ['sinopsis de Pluto', 'pluto', 'synopsis'],
    ['what is the mean score of Hunter x Hunter 2011', 'hunter x hunter 2011', 'score'],
    ['what studio animated Fate Stay Night', 'fate stay night', 'studio'],
    ['año de lanzamiento de Akira', 'akira', 'start_date'],
    ['cuándo se estrena la próxima parte de Bleach', 'bleach', 'next_episode_date'],
    ['when does the next season of Jujutsu Kaisen air', 'jujutsu kaisen', 'next_season_date']
  ])('detecta campo especifico: %s', (input, title, field) => {
    expect(matchAnimeInfoFieldIntent(normalizeEntityText(input))).toEqual({
      intent: 'SHOW_ANIME_INFO',
      entities: {
        refIndexOrTitle: title,
        animeTitle: title,
        field
      }
    });
  });

  it('no inventa una consulta cuando falta una referencia', () => {
    expect(matchGeneralAnimeInfoIntent('informacion')).toBeUndefined();
    expect(matchAnimeInfoFieldIntent('cuantos capitulos tiene')).toBeUndefined();
  });

  it('mantiene fuera las frases de mutacion de biblioteca', () => {
    expect(matchGeneralAnimeInfoIntent('agrega death note')).toBeUndefined();
    expect(matchAnimeInfoFieldIntent('elimina death note')).toBeUndefined();
  });
});
