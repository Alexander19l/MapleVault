import type { NLPResult } from './types';
import { cleanReference } from './intentReferenceUtils';

export function matchSynchronizationIntent(normalizedMessage: string): string | undefined {
  if (normalizedMessage.match(/sincroniza|actualiza( mis)? listas|sincronizacion|reintenta.*sincroniz/)) {
    return 'SYNC_LIBRARY';
  }
  if (normalizedMessage.match(/actualiza.*metadatos/)) return 'SYNC_METADATA';
  if (normalizedMessage.match(/actualiza.*capitulos|busca.*capitulos nuevos|verifica.*capitulos/)) {
    return 'SYNC_EPISODES';
  }
  if (normalizedMessage.match(/cancela.*sincronizac/)) return 'CANCEL_SYNC';
  if (normalizedMessage.match(/resumen.*sincronizac/)) return 'SYNC_SUMMARY';
  return undefined;
}

export function extractMarkedEpisodeEntities(
  normalizedMessage: string
): Partial<NLPResult['entities']> {
  const match = normalizedMessage.match(
    /\bmarca\s+(?:el\s+)?(?:capitulo|episodio)\s+(\d{1,4})(?:\s+(?:de|del)\s+(.+?))?\s+como\s+visto\b/
  );
  if (!match?.[1]) return {};

  const entities: Partial<NLPResult['entities']> = {
    episodeNumber: Number(match[1])
  };
  if (match[2]) {
    const reference = cleanReference(match[2]);
    entities.refIndexOrTitle = reference;
    entities.animeTitle = reference;
  }
  return entities;
}

export function matchEpisodeOperationIntent(normalizedMessage: string): string | undefined {
  if (normalizedMessage.match(/muestrame.*capitulos/)) return 'SHOW_EPISODES';
  if (normalizedMessage.match(/marca.*visto/)) {
    return normalizedMessage.includes('todos') || normalizedMessage.includes('anteriores')
      ? 'MARK_ALL_WATCHED'
      : 'MARK_EPISODE_WATCHED';
  }
  if (normalizedMessage.match(/ultimo capitulo visto/)) return 'LAST_WATCHED_EPISODE';
  if (normalizedMessage.match(/ultimos\s+capitulos?\s+vistos?/)) return 'FILTER_EPISODES_WATCHED';
  if (normalizedMessage.match(/siguiente.*pendiente/)) return 'NEXT_PENDING_EPISODE';
  if (normalizedMessage.match(/ordena.*menor a mayor/)) return 'SORT_EPISODES_ASC';
  if (normalizedMessage.match(/ordena.*mayor a menor/)) return 'SORT_EPISODES_DESC';
  if (normalizedMessage.match(/filtra.*vistos/)) return 'FILTER_EPISODES_WATCHED';
  if (normalizedMessage.match(/filtra.*pendientes|que capitulos.*pendientes/)) {
    return 'FILTER_EPISODES_PENDING';
  }
  if (normalizedMessage.match(/que\s+capitulos?\s+me\s+faltan/)) return 'FILTER_EPISODES_PENDING';
  if (normalizedMessage.match(/abre.*capitulo/)) return 'OPEN_EPISODE';
  return undefined;
}
