import { describe, expect, it } from 'vitest';
import {
  extractGenreEntity,
  extractRelativeYearEntities,
  extractScoreEntities,
  extractStudioEntity,
  hasStructuredPreferenceEntity,
  normalizeDurationPreference,
  normalizeFormatEntity,
  normalizeStatusEntity
} from '../entityExtractor';
import { isGreetingMessage, isRecommendationRequest, isStructuredSearchRequest } from '../intentMatcher';
import { detectLanguage } from '../languageDetector';
import { normalizeEntityText } from '../nlpText';
import { extractImplicitExclusions, extractSemanticQuery } from '../semanticHints';

describe('chatbot/nlp modules', () => {
  it('normalizes text and detects language without depending on nlpEngine', () => {
    expect(normalizeEntityText('  Acción romántica  ')).toBe('accion romantica');
    expect(detectLanguage('busca un anime de accion')).toBe('es');
    expect(detectLanguage('recommend me a good action anime')).toBe('en');
  });

  it('extracts core entities from natural language prompts', () => {
    expect(normalizeStatusEntity('la estoy viendo')).toBe('watching');
    expect(normalizeFormatEntity('OVAs de los 90')).toBe('ova');
    expect(normalizeDurationPreference('quiero una serie corta')).toBe('short');
    expect(extractStudioEntity('muestrame animes de MAPPA')).toBe('mappa');
    expect(extractGenreEntity('comedia romantica y terror psicologico')).toBe('romance, comedy, psychological, horror');
  });

  it('extracts numeric and temporal filters', () => {
    expect(extractScoreEntities('algo entre 7 y 9 en nota')).toEqual({ min_score: 7, max_score: 9 });
    expect(extractScoreEntities('con mas de 8 de puntuacion')).toEqual({ min_score: 8, score: 8 });
    expect(extractRelativeYearEntities('OVAs de los 90')).toEqual({ year_from: 1990, year_to: 1999 });
  });

  it('extracts semantic hints and explicit exclusions', () => {
    expect(extractSemanticQuery('busca el anime del chico que come demonios')).toBe('demon slayer');
    expect(extractImplicitExclusions('aparte de Dragon Ball, que shounen recomiendas')).toEqual(['Dragon Ball']);
  });

  it('matches intent helper predicates', () => {
    const entities = { season: 'fall' };

    expect(isRecommendationRequest('dame una sugerencia', 'dame una sugerencia')).toBe(true);
    expect(isStructuredSearchRequest('que salio en otono 2023', 'que salio en otono 2023', entities)).toBe(true);
    expect(isGreetingMessage('hola Maple', 'hola maple')).toBe(true);
    expect(hasStructuredPreferenceEntity({ genre: 'comedy' })).toBe(true);
  });
});
