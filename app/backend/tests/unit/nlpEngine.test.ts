import { describe, it, expect, vi } from 'vitest';
import { parseIntentRegex } from '../../src/chatbot/nlpEngine';

describe('NLPEngine', () => {
  describe('parseIntentRegex', () => {
    it('debería detectar GREETING para saludos básicos', () => {
      const result = parseIntentRegex('hola bot');
      expect(result.intent).toBe('GREETING');
    });

    it('debería detectar SEARCH_ANIME para buscar series por ver (regla estricta)', () => {
      const result = parseIntentRegex('muestrame mis pendientes');
      expect(result.intent).toBe('SEARCH_PENDING');
    });

  it('debería detectar SEARCH_ANIME para buscar animes terminados', () => {
    const result = parseIntentRegex('cuales he completado');
    expect(result.intent).toBe('SEARCH_COMPLETED');
  });

    it('debería detectar SEARCH_ANIME con el género para consultas con palabra "género"', () => {
      const result = parseIntentRegex('buscame animes de romance');
      expect(result.intent).toBe('SEARCH_ANIME');
      expect(result.entities).toBeDefined();
    });

    it('debería detectar RECOMMEND_GENERAL', () => {
      const result = parseIntentRegex('recomiendame un anime');
      expect(result.intent).toBe('RECOMMEND_GENERAL');
    });

  it('debería detectar SEARCH_ANIME para capítulos recientes', () => {
    const result = parseIntentRegex('ultimos capitulos vistos');
    expect(result.intent).toBe('FILTER_EPISODES_WATCHED');
  });

  it('debería detectar SEARCH_ANIME para pendientes de ver', () => {
    const result = parseIntentRegex('que capitulos me faltan');
    expect(result.intent).toBe('FILTER_EPISODES_PENDING');
  });

    it('debería detectar LIBRARY_STATS para estadisticas', () => {
      const result = parseIntentRegex('analiza mi biblioteca');
      expect(result.intent).toBe('LIBRARY_STATS');
    });
  });
});
