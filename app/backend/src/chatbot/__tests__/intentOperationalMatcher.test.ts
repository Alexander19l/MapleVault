import { describe, expect, it } from 'vitest';
import {
  extractMarkedEpisodeEntities,
  matchEpisodeOperationIntent,
  matchSynchronizationIntent
} from '../intentOperationalMatcher';
import { normalizeEntityText } from '../nlpText';

describe('chatbot/intentOperationalMatcher', () => {
  it.each([
    ['sincroniza mi biblioteca', 'SYNC_LIBRARY'],
    ['actualiza mis listas', 'SYNC_LIBRARY'],
    ['actualiza metadatos', 'SYNC_METADATA'],
    ['busca capitulos nuevos', 'SYNC_EPISODES'],
    ['cancela la sincronizacion', 'CANCEL_SYNC'],
    ['resumen de sincronizacion', 'SYNC_SUMMARY']
  ])('detecta operacion de sincronizacion: %s', (input, intent) => {
    expect(matchSynchronizationIntent(normalizeEntityText(input))).toBe(intent);
  });

  it('prioriza cancelar y resumir sobre la regla generica de sincronizacion', () => {
    expect(matchSynchronizationIntent('cancela la sincronizacion')).toBe('CANCEL_SYNC');
    expect(matchSynchronizationIntent('resumen de sincronizacion')).toBe('SYNC_SUMMARY');
  });

  it.each([
    ['muestrame los capitulos', 'SHOW_EPISODES'],
    ['marca el capitulo 3 como visto', 'MARK_EPISODE_WATCHED'],
    ['marca todos los capitulos como vistos', 'MARK_ALL_WATCHED'],
    ['marca los anteriores como vistos', 'MARK_ALL_WATCHED'],
    ['ultimo capitulo visto', 'LAST_WATCHED_EPISODE'],
    ['ultimos capitulos vistos', 'FILTER_EPISODES_WATCHED'],
    ['siguiente capitulo pendiente', 'NEXT_PENDING_EPISODE'],
    ['ordena capitulos de menor a mayor', 'SORT_EPISODES_ASC'],
    ['ordena capitulos de mayor a menor', 'SORT_EPISODES_DESC'],
    ['filtra capitulos vistos', 'FILTER_EPISODES_WATCHED'],
    ['filtra capitulos pendientes', 'FILTER_EPISODES_PENDING'],
    ['que capitulos me faltan', 'FILTER_EPISODES_PENDING'],
    ['abre el capitulo 4', 'OPEN_EPISODE']
  ])('detecta operacion de episodios: %s', (input, intent) => {
    expect(matchEpisodeOperationIntent(normalizeEntityText(input))).toBe(intent);
  });

  it('distingue el ultimo capitulo de un listado de capitulos recientes', () => {
    expect(matchEpisodeOperationIntent('ultimo capitulo visto')).toBe('LAST_WATCHED_EPISODE');
    expect(matchEpisodeOperationIntent('ultimos capitulos vistos')).toBe('FILTER_EPISODES_WATCHED');
  });

  it('extrae serie y numero para una actualizacion protegida', () => {
    const input = 'marca el episodio 3 de naruto como visto';
    expect(matchEpisodeOperationIntent(input)).toBe('MARK_EPISODE_WATCHED');
    expect(extractMarkedEpisodeEntities(input)).toEqual({
      episodeNumber: 3,
      refIndexOrTitle: 'naruto',
      animeTitle: 'naruto'
    });
  });

  it('no interpreta consultas generales como operaciones', () => {
    expect(matchSynchronizationIntent('mi biblioteca')).toBeUndefined();
    expect(matchEpisodeOperationIntent('naruto tiene capitulos')).toBeUndefined();
  });
});
