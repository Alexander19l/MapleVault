import type { NLPResult } from './types';
import { normalizeEntityText } from './nlpText';

export function detectLanguage(message: string): NLPResult['language'] {
  const normalized = normalizeEntityText(message);
  const spanishSignals = [
    'busca', 'buscar', 'recomiend', 'sugiere', 'quiero', 'dame', 'muestr',
    'anime de', 'serie de', 'que', 'cual', 'genero', 'capitulo', 'catalogo',
    'lista', 'mis ', 'me gusta', 'no me', 'donde', 'capitulos', 'peliculas',
    'ponle', 'agrega', 'quita', 'borra', 'marca', 'estado'
  ];
  const englishSignals = [
    'search', 'recommend', 'suggest', 'what', 'should', 'watch', 'good',
    'with', 'anime with', 'my list', 'show me', 'find', 'give me', 'remove',
    'add ', 'from my', 'list movies', 'when does', 'studio animated',
    'something like', 'shorter', 'anything', 'produced by', 'highly rated',
    'older than', 'without', 'under ', 'any ', 'historical', 'set in',
    'list ', 'show ', 'films', 'release date', 'sorted by', 'available on'
  ];

  const spanishScore = spanishSignals.filter(signal => normalized.includes(signal)).length
    + (/[áéíóúñ¿¡]/i.test(message) ? 2 : 0);
  const englishScore = englishSignals.filter(signal => normalized.includes(signal)).length;

  if (spanishScore > 0 && englishScore > 0 && spanishScore === englishScore) return 'mixed';
  return spanishScore >= englishScore ? 'es' : 'en';
}
