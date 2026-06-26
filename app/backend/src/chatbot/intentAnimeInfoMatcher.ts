import type { NLPResult } from './types';
import { cleanReference, extractReferenceOrTitle } from './intentReferenceUtils';

export interface AnimeInfoIntentMatch {
  intent: 'SHOW_ANIME_INFO';
  entities: Partial<NLPResult['entities']>;
}

function buildAnimeInfoMatch(
  reference: string,
  field?: NLPResult['entities']['field']
): AnimeInfoIntentMatch {
  const title = cleanReference(reference);
  return {
    intent: 'SHOW_ANIME_INFO',
    entities: {
      refIndexOrTitle: title,
      animeTitle: title,
      ...(field ? { field } : {})
    }
  };
}

export function matchGeneralAnimeInfoIntent(normalizedMessage: string): AnimeInfoIntentMatch | undefined {
  const reference = extractReferenceOrTitle(normalizedMessage, [
    /^info\s+(.+)/,
    /^(?:dame|dime|muestra|mostrar|pasame)\s+(?:info|informacion|detalles?)\s+(?:de|del|sobre)\s+(.+)/,
    /^(?:info|informacion|detalles?)\s+(?:de|del|sobre)\s+(.+)/,
    /^(?:que sabes de|detalles de)\s+(.+)/,
    /^ver\s+info\s+(.+)/,
    /^show\s+(?:me\s+)?(?:info|information|details)\s+(?:about|of)\s+(.+)/
  ]);
  return reference ? buildAnimeInfoMatch(reference) : undefined;
}

const ANIME_INFO_FIELD_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  field: NonNullable<NLPResult['entities']['field']>;
}> = [
  { pattern: /\bcuantos\s+(?:episodios|capitulos)\s+tiene\s+(.+)$/, field: 'episodes' },
  { pattern: /\bcuando\s+(?:empezo|inicio|salio)\s+(.+)$/, field: 'start_date' },
  { pattern: /\b(?:de que trata|sinopsis de|resume)\s+(.+)$/, field: 'synopsis' },
  { pattern: /\b(?:cual es la nota|mean score of|puntaje de)\s+(.+)$/, field: 'score' },
  { pattern: /\b(?:que estudio.*hizo|estudio de animacion que hizo|what studio animated)\s+(.+)$/, field: 'studio' },
  { pattern: /\b(?:ano de lanzamiento de|cuando se estreno)\s+(.+)$/, field: 'start_date' },
  { pattern: /\b(?:cuando se estrena la proxima parte de|when does the next episode of)\s+(.+)$/, field: 'next_episode_date' },
  { pattern: /\b(?:cuando.*proxima temporada de|when does the next season of)\s+(.+?)(?:\s+air)?$/, field: 'next_season_date' }
];

export function matchAnimeInfoFieldIntent(normalizedMessage: string): AnimeInfoIntentMatch | undefined {
  for (const { pattern, field } of ANIME_INFO_FIELD_PATTERNS) {
    const match = normalizedMessage.match(pattern);
    if (match?.[1]) return buildAnimeInfoMatch(match[1], field);
  }
  return undefined;
}
