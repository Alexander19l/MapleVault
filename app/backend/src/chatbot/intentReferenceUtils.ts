import { normalizeEntityText } from './nlpText';
import type { NLPResult } from './types';

export function extractReferenceOrTitle(message: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const value = match?.[1] || match?.[2] || match?.[3];
    if (value) return value.trim();
  }
  return undefined;
}

export function cleanReference(value: string): string {
  return value
    .replace(/\s+--(?:force|yes|confirm)\b.*$/i, '')
    .replace(/^(?:el|la|los|las|del|de la|de los|de las)\s+/i, '')
    .replace(/\s+(?:from|de)\s+(?:my\s+)?(?:watching|completed|dropped|plan to watch)\s+list$/i, '')
    .replace(/\s+(?:to|a)\s+(?:my\s+)?(?:watchlist|watching list|completed list|dropped list)$/i, '')
    .replace(/\s+(a|como)\s+(pendiente|pendientes|viendo|completado|completada|abandonado|abandonada|pausado|pausada)$/i, '')
    .replace(/\s+a\s+mi\s+lista(?:\s+de\s+\w+)?$/i, '')
    .trim();
}

export function cleanFeedbackReference(value: string): string {
  return value
    .replace(/^[\s"'`]+|[\s"'`.,!?]+$/g, '')
    .replace(/^(?:el|la|los|las)\s+(?:anime|serie)\s+/i, '')
    .replace(/^(?:anime|serie)\s+/i, '')
    .trim();
}

export function extractFeedbackReference(message: string, mode: 'like' | 'dislike'): string | undefined {
  const normalized = normalizeEntityText(message);
  const patterns = mode === 'dislike'
    ? [
        /\b(?:no me recomiendes|no recomiendes|no me sugieras|no sugieras)\s+(.+)$/i,
        /\b(?:no me vuelvas a sugerir|no me vuelvas a recomendar)\s+(.+)$/i,
        /\b(?:no me interesa|no me gusta|no me gustan|odio|evita)\s+(.+)$/i
      ]
    : [
        /\b(?:me gusto|me gusta|me gustan|me encanto|me encanta|me interesa|me enganche)\s+(.+)$/i
      ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const reference = match?.[1] ? cleanFeedbackReference(match[1]) : '';
    if (reference) return reference;
  }

  return undefined;
}

export function assignFeedbackReference(result: NLPResult, reference: string): void {
  result.entities.refIndexOrTitle = reference;
  result.entities.animeTitle = reference;
}
