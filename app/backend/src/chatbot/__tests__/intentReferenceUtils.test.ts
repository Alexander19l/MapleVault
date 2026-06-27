import { describe, expect, it } from 'vitest';
import {
  assignFeedbackReference,
  cleanFeedbackReference,
  cleanReference,
  extractFeedbackReference,
  extractReferenceOrTitle
} from '../intentReferenceUtils';
import type { NLPResult } from '../types';

describe('chatbot/intentReferenceUtils', () => {
  it('extrae referencias desde patrones ordenados', () => {
    expect(extractReferenceOrTitle('dame info del 3', [
      /^info\s+(.+)/,
      /^(?:dame)\s+info\s+(?:de|del)\s+(.+)/
    ])).toBe('3');
  });

  it('limpia referencias de acciones y flags simulados', () => {
    expect(cleanReference('el Death Note --force --yes')).toBe('Death Note');
    expect(cleanReference('Kaguya-sama a mi lista de pendientes')).toBe('Kaguya-sama');
    expect(cleanReference('Boruto from my watching list')).toBe('Boruto');
  });

  it('limpia referencias de feedback sin prefijos genericos', () => {
    expect(cleanFeedbackReference('"el anime Evangelion!"')).toBe('Evangelion');
    expect(cleanFeedbackReference('serie Monster.')).toBe('Monster');
  });

  it('detecta referencias de gusto y rechazo normalizadas', () => {
    expect(extractFeedbackReference('no me vuelvas a sugerir Sword Art Online', 'dislike')).toBe('sword art online');
    expect(extractFeedbackReference('me encanta Vinland Saga', 'like')).toBe('vinland saga');
  });

  it('asigna referencia compartida para resolucion posterior', () => {
    const result: NLPResult = {
      intent: 'UNKNOWN',
      engine: 'regex',
      sanitized: true,
      entities: {}
    };

    assignFeedbackReference(result, 'monster');

    expect(result.entities).toMatchObject({
      refIndexOrTitle: 'monster',
      animeTitle: 'monster'
    });
  });
});
