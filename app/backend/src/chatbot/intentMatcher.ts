import type { NLPResult } from './types';

export function isRecommendationRequest(message: string, normalizedMessage: string): boolean {
  return Boolean(
    normalizedMessage.match(/\b(recomiendame|recomienda|recomendame|que deberia ver|que veo|dame una sugerencia|sugerencia|dame otra?|dame mas|uno mas|siguiente|otro|recommend|suggest|give me|anything like|another suggestion)\b/)
    || message.match(/recom[ei]enda|sugiere|qu[eé] ver despu[eé]s/)
  );
}

export function isStructuredSearchRequest(
  message: string,
  normalizedMessage: string,
  entities: NLPResult['entities']
): boolean {
  const hasStructuredSearchEntity = Boolean(
    entities.season
    || entities.format
    || entities.formats?.length
    || entities.studio
    || entities.year_from
    || entities.year_to
    || entities.min_episodes !== undefined
    || entities.max_episodes !== undefined
    || entities.duration_max !== undefined
    || entities.tags?.length
    || entities.exclude_tags?.length
    || entities.min_score !== undefined
    || entities.max_score !== undefined
    || entities.airing_status
    || entities.staff
    || entities.source_material
    || entities.sort_by
    || entities.exclude_origin
  );

  if (!hasStructuredSearchEntity) return false;

  return Boolean(
    normalizedMessage.match(/\b(busca|buscar|muestra|muestrame|pasame|quiero ver|que hizo|salio|anime|animes|ovas?|peliculas?|find|search|show|list)\b/)
    || message.match(/\b(busca|buscar|muestra|muestrame|mu[eé]strame|que hizo|qu[eé] hizo|salio|sali[oó]|anime|animes|ovas?|peliculas?)\b/)
  );
}

export function isGreetingMessage(message: string, normalizedMessage: string): boolean {
  return Boolean(
    normalizedMessage.match(/\b(como estas|buenos dias|buenas tardes|buenas noches)\b/)
    || message.match(/hola|buenos d[ií]as|buenas tardes|buenas noches/)
  );
}
