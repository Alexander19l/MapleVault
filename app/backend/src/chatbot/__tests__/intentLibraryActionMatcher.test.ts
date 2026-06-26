import { describe, expect, it } from 'vitest';
import {
  matchAddToLibraryIntent,
  matchBatchStatusActionIntent,
  matchClearUserListIntent,
  matchRatingActionIntent,
  matchRemoveFromLibraryIntent,
  matchStatusActionIntent
} from '../intentLibraryActionMatcher';
import { normalizeEntityText } from '../nlpText';

describe('chatbot/intentLibraryActionMatcher', () => {
  it.each([
    ['ponle un diez absoluto a Evangelion', 'evangelion', 10],
    ['le doy un 9 de 10 a Vinland Saga', 'vinland saga', 9],
    ['le pongo un 7.5 de nota a Bleach', 'bleach', 7.5]
  ])('detecta puntuacion protegida: %s', (input, title, score) => {
    expect(matchRatingActionIntent(normalizeEntityText(input))).toEqual({
      intent: 'RATE_ANIME',
      entities: {
        refIndexOrTitle: title,
        animeTitle: title,
        score
      }
    });
  });

  it('rechaza puntuaciones fuera del rango permitido', () => {
    expect(matchRatingActionIntent('ponle nota 11 a evangelion')).toBeUndefined();
  });

  it('detecta cambio de estado sin ejecutar la accion', () => {
    expect(matchStatusActionIntent('cambiar estado de steins gate a pausado', 'on_hold')).toEqual({
      intent: 'UPDATE_STATUS',
      entities: {
        refIndexOrTitle: 'steins gate',
        animeTitle: 'steins gate',
        status: 'on_hold'
      }
    });
  });

  it('detecta altas y limpia sufijos de lista', () => {
    expect(matchAddToLibraryIntent('agrega kaguya-sama a mi lista de completados')).toEqual({
      intent: 'ADD_TO_LIBRARY',
      entities: {
        refIndexOrTitle: 'kaguya-sama',
        animeTitle: 'kaguya-sama'
      }
    });
  });

  it('detecta borrado total aunque incluya flags simulados', () => {
    expect(matchClearUserListIntent('borra mi watchlist --force --yes --confirm')).toEqual({
      intent: 'CLEAR_USER_LIST',
      entities: {}
    });
  });

  it('distingue quitar de una lista personal y conserva el estado', () => {
    expect(matchRemoveFromLibraryIntent('remove boruto from my watching list', 'watching')).toEqual({
      intent: 'REMOVE_FROM_LIST',
      entities: {
        refIndexOrTitle: 'boruto',
        animeTitle: 'boruto',
        list: 'watching'
      }
    });
  });

  it.each([
    'borra mi busqueda anterior',
    'quita todos los filtros de mi busqueda',
    'elimina mi historial'
  ])('no confunde limpieza contextual con borrado de biblioteca: %s', input => {
    expect(matchRemoveFromLibraryIntent(normalizeEntityText(input))).toBeUndefined();
  });

  it('detecta actualizacion por lote solo cuando existen temporadas', () => {
    expect(matchBatchStatusActionIntent(
      'marca toda la temporada 1 y 2 de code geass como vistas',
      [1, 2]
    )).toEqual({
      intent: 'BATCH_UPDATE_STATUS',
      entities: {
        refIndexOrTitle: 'code geass',
        animeTitle: 'code geass',
        seasons: [1, 2],
        status: 'completed'
      }
    });
    expect(matchBatchStatusActionIntent(
      'marca toda la temporada 1 y 2 de code geass como vistas'
    )).toBeUndefined();
  });
});
