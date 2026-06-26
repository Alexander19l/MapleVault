import { describe, expect, it } from 'vitest';
import {
  matchClearSearchFiltersIntent,
  matchHelpIntent,
  matchNavigationIntent,
  matchViewCatalogIntent
} from '../intentNavigationMatcher';
import { normalizeEntityText } from '../nlpText';

describe('chatbot/intentNavigationMatcher', () => {
  it.each([
    'ayuda',
    '/help',
    'que sabes hacer',
    'what tools or features do you have right now'
  ])('detecta ayuda: %s', input => {
    expect(matchHelpIntent(normalizeEntityText(input))).toBe(true);
  });

  it('detecta limpieza de filtros de busqueda', () => {
    expect(matchClearSearchFiltersIntent('quita todos los filtros de mi busqueda')).toBe(true);
    expect(matchClearSearchFiltersIntent('limpia mi historial')).toBe(false);
  });

  it.each([
    'mi catalogo',
    'muestrame mi catalogo',
    'mi lista',
    'que tengo guardado'
  ])('detecta vista de catalogo: %s', input => {
    expect(matchViewCatalogIntent(normalizeEntityText(input))).toBe(true);
  });

  it('detecta navegacion contextual y mantiene entidades esperadas', () => {
    expect(matchNavigationIntent('pagina anterior')).toEqual({
      intent: 'PREVIOUS_ACTIVE_PAGE',
      entities: { context_continuation: true }
    });

    expect(matchNavigationIntent('pagina 7')).toEqual({
      intent: 'NAVIGATE_ACTIVE_PAGE',
      entities: { page: 7, context_continuation: true }
    });

    expect(matchNavigationIntent('ver mas resultados')).toEqual({
      intent: 'CONTINUE_RESULTS',
      entities: { context_continuation: true }
    });

    expect(matchNavigationIntent('continua con mi catalogo')).toEqual({
      intent: 'CONTINUE_CATALOG',
      entities: { context_continuation: true }
    });

    expect(matchNavigationIntent('ver mas series')).toEqual({
      intent: 'CONTINUE_ACTIVE',
      entities: { context_continuation: true }
    });
  });

  it('no interpreta anios o texto amplio como navegacion directa', () => {
    expect(matchNavigationIntent('busca animes de 2024')).toBeUndefined();
    expect(matchNavigationIntent('pagina 0')).toBeUndefined();
  });
});
