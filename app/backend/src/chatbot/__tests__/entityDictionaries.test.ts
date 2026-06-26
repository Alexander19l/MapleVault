import { describe, expect, it } from 'vitest';
import {
  ANIME_GENRE_DEFINITIONS,
  ANIME_TAG_DEFINITIONS,
  findDefinitionValues
} from '../entityDictionaries';
import { normalizeEntityText } from '../nlpText';

describe('entityDictionaries', () => {
  it('encuentra generos compuestos sin depender de texto exacto del usuario', () => {
    const normalized = normalizeEntityText('Recomiendame una comedia romantica con terror psicologico');

    expect(findDefinitionValues(normalized, ANIME_GENRE_DEFINITIONS)).toEqual(
      expect.arrayContaining(['comedy', 'romance', 'horror', 'psychological'])
    );
  });

  it('encuentra tags semanticos usados por busquedas avanzadas', () => {
    const normalized = normalizeEntityText('Busca animes sobre hackers, computadoras o terminales');

    expect(findDefinitionValues(normalized, ANIME_TAG_DEFINITIONS)).toEqual(
      expect.arrayContaining(['hacking', 'technology'])
    );
  });

  it('respeta limites de palabra para evitar falsos positivos', () => {
    const normalized = normalizeEntityText('quiero algo con magiarealista');

    expect(findDefinitionValues(normalized, ANIME_TAG_DEFINITIONS)).not.toContain('magic');
  });
});
