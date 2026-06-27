import type { NLPResult } from './types';
import { cleanReference, extractReferenceOrTitle } from './intentReferenceUtils';

export interface LibraryActionIntentMatch {
  intent: string;
  entities: Partial<NLPResult['entities']>;
}

function buildTitleMatch(intent: string, title: string): LibraryActionIntentMatch {
  const reference = cleanReference(title);
  return {
    intent,
    entities: {
      refIndexOrTitle: reference,
      animeTitle: reference
    }
  };
}

export function matchRatingActionIntent(normalizedMessage: string): LibraryActionIntentMatch | undefined {
  const absoluteTenMatch = normalizedMessage.match(/\bponle\s+un\s+diez\s+absoluto\s+a\s+(.+)$/);
  const numericRatingMatch = normalizedMessage.match(
    /\b(?:ponle|le doy|le pongo|califica|rate)\s+(?:un\s+)?(?:nota\s+)?(\d+(?:\.\d+)?)\s*(?:de\s+10|\/10|de\s+nota)?\s+(?:a\s+)?(.+)$/
  );
  const title = absoluteTenMatch?.[1] || numericRatingMatch?.[2];
  if (!title) return undefined;

  const score = absoluteTenMatch ? 10 : Number(numericRatingMatch?.[1]);
  if (!Number.isFinite(score) || score < 0 || score > 10) return undefined;

  const match = buildTitleMatch('RATE_ANIME', title);
  match.entities.score = score;
  return match;
}

export function matchStatusActionIntent(
  normalizedMessage: string,
  status?: string
): LibraryActionIntentMatch | undefined {
  const statusMatch = normalizedMessage.match(
    /\b(?:marcar|marca|cambiar estado de|change status of)\s+(.+?)\s+(?:como|a|to)\s+(viendo|en progreso|pendiente|completado|completada|abandonado|abandonada|pausado|pausada|watching|completed|dropped|on hold)\b/
  );
  if (!statusMatch?.[1] || !status) return undefined;

  const match = buildTitleMatch('UPDATE_STATUS', statusMatch[1]);
  match.entities.status = status;
  return match;
}

export function matchAddToLibraryIntent(normalizedMessage: string): LibraryActionIntentMatch | undefined {
  const reference = extractReferenceOrTitle(normalizedMessage, [
    /^agrega(?:r)?\s+(?:el\s+)?(.+)/,
    /^anade\s+(?:el\s+)?(.+)/,
    /^importa\s+(?:el\s+)?(.+)/,
    /^add\s+(.+)/
  ]);
  if (!reference || normalizedMessage.match(/\bbusqueda anterior\b/)) return undefined;

  return buildTitleMatch('ADD_TO_LIBRARY', reference);
}

export function matchClearUserListIntent(normalizedMessage: string): LibraryActionIntentMatch | undefined {
  if (!normalizedMessage.match(/^borra mi watchlist(?:\s+--(?:force|yes|confirm))*$/)) return undefined;
  return { intent: 'CLEAR_USER_LIST', entities: {} };
}

export function matchRemoveFromLibraryIntent(
  normalizedMessage: string,
  status?: string
): LibraryActionIntentMatch | undefined {
  const reference = extractReferenceOrTitle(normalizedMessage, [
    /^elimina(?:r)?\s+(?:el\s+)?(.+)/,
    /^borra(?:r)?\s+(?:el\s+)?(.+)/,
    /^quita(?:r)?\s+(?:el\s+)?(.+)/,
    /^remove\s+(.+)/
  ]);
  if (!reference || normalizedMessage.match(/\b(busqueda|filtro|historial)\b/)) return undefined;

  const match = buildTitleMatch('REMOVE_FROM_LIBRARY', reference);
  if (normalizedMessage.match(/\bfrom\s+(?:my\s+)?(?:watching|completed|dropped|plan to watch)(?:\s+list)?\b/)) {
    match.intent = 'REMOVE_FROM_LIST';
    match.entities.list = status || normalizedMessage.match(/\b(watching|completed|dropped|plan to watch)\b/)?.[1];
  }
  return match;
}

export function matchBatchStatusActionIntent(
  normalizedMessage: string,
  seasons?: number[]
): LibraryActionIntentMatch | undefined {
  const batchMatch = normalizedMessage.match(
    /\bmarca\s+(?:toda\s+)?(?:la\s+)?temporada(?:s)?\s+[0-9y,\s]+\s+de\s+(.+?)\s+como\s+vistas?\b/
  );
  if (!batchMatch?.[1] || !seasons?.length) return undefined;

  const match = buildTitleMatch('BATCH_UPDATE_STATUS', batchMatch[1]);
  match.entities.seasons = seasons;
  match.entities.status = 'completed';
  return match;
}
