import type { NLPResult } from './types';

export interface NavigationIntentMatch {
  intent: string;
  entities?: Partial<NLPResult['entities']>;
}

export function matchHelpIntent(normalizedMessage: string): boolean {
  return Boolean(
    normalizedMessage.match(/^\/?(ayuda|help|comandos|commands|opciones|capacidades)$/)
    || normalizedMessage.match(/^(muestrame|mostrar|ver)\s+(la\s+)?(ayuda|lista de comandos|capacidades)$/)
    || normalizedMessage.match(/^que\s+(puedes|sabes)\s+hacer/)
    || normalizedMessage.match(/^como\s+(te\s+)?(uso|utilizo)/)
    || normalizedMessage.match(/\b(what can you do|show help|what tools or features do you have)\b/)
  );
}

export function matchClearSearchFiltersIntent(normalizedMessage: string): boolean {
  return Boolean(normalizedMessage.match(/\b(?:quita todos los filtros|clear all search filters)\b/));
}

export function matchViewCatalogIntent(normalizedMessage: string): boolean {
  return Boolean(
    normalizedMessage.match(/^(mi\s+)?catalogo$/)
    || normalizedMessage.match(/^(muestrame|mostrar|ver)\s+(mi\s+|el\s+)?catalogo$/)
    || normalizedMessage.match(/^mi\s+lista$/)
    || normalizedMessage.match(/^que\s+tengo/)
  );
}

export function matchNavigationIntent(normalizedMessage: string): NavigationIntentMatch | undefined {
  if (
    normalizedMessage.match(/^pagina\s+anterior$/)
    || normalizedMessage.match(/^(?:volver|regresar|ir)\s+(?:a\s+)?(?:la\s+)?pagina\s+anterior$/)
    || normalizedMessage.match(/^(?:previous|back)\s+page$/)
  ) {
    return {
      intent: 'PREVIOUS_ACTIVE_PAGE',
      entities: { context_continuation: true }
    };
  }

  const directPageMatch = normalizedMessage.match(
    /^(?:(?:ir|ve|mostrar|muestrame|mostrame|abre|cargar)\s+(?:a\s+)?(?:la\s+)?pagina|pagina|go\s+to\s+page|show\s+page)\s+([1-9]\d{0,2})$/
  );
  if (directPageMatch) {
    return {
      intent: 'NAVIGATE_ACTIVE_PAGE',
      entities: {
        page: Number(directPageMatch[1]),
        context_continuation: true
      }
    };
  }

  if (
    normalizedMessage.match(/^(?:ver|mostrar|muestrame|mostrame|dame|cargar)\s+mas\s+(?:resultados|opciones|recomendaciones|pendientes|completados|completadas)$/)
    || normalizedMessage.match(/^(?:siguiente|proxima)\s+pagina\s+(?:de\s+)?(?:resultados|recomendaciones|pendientes|completados)$/)
    || normalizedMessage.match(/^(?:show|load)\s+more\s+(?:results|recommendations|pending|completed)$/)
  ) {
    return {
      intent: 'CONTINUE_RESULTS',
      entities: { context_continuation: true }
    };
  }

  if (
    normalizedMessage.match(/^(?:ver|mostrar|muestrame|mostrame|dame|cargar)\s+mas\s+(?:series|animes)\s+de\s+mi\s+catalogo$/)
    || normalizedMessage.match(/^(?:siguiente|proxima)\s+pagina\s+del\s+catalogo$/)
    || normalizedMessage.match(/^continua(?:r)?\s+(?:con\s+)?(?:mi\s+)?catalogo$/)
    || normalizedMessage.match(/^(?:show|load)\s+more\s+(?:anime|series)\s+from\s+my\s+catalog$/)
  ) {
    return {
      intent: 'CONTINUE_CATALOG',
      entities: { context_continuation: true }
    };
  }

  if (
    normalizedMessage.match(/^(?:ver|mostrar|muestrame|mostrame|dame|cargar)\s+mas\s+(?:series|animes)$/)
    || normalizedMessage.match(/^(?:siguiente|proxima)\s+pagina$/)
    || normalizedMessage.match(/^(?:show|load)\s+more\s+(?:anime|series)$/)
  ) {
    return {
      intent: 'CONTINUE_ACTIVE',
      entities: { context_continuation: true }
    };
  }

  return undefined;
}
