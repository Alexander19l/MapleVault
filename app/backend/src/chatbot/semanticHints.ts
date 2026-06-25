import { normalizeEntityText } from './nlpText';

function cleanReferenceSegment(value: string): string {
  return value
    .replace(/^(?:el|la|los|las|del|de la|de los|de las)\s+/i, '')
    .replace(/\s+(a|como)\s+(pendiente|pendientes|viendo|completado|completada|abandonado|abandonada)$/i, '')
    .trim();
}

export function extractImplicitExclusions(message: string): string[] | undefined {
  const exclusions: string[] = [];
  const patterns = [
    /\b(?:aparte de|excepto|sin)\s+([^,?.!]+)/i,
    /\bya vi\s+([^,?.!]+)/i,
    /\bvi\s+([^,?.!]+),?\s+(?:dame|recomienda|sugiere)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const clean = cleanReferenceSegment(match[1])
        .replace(/\s+(?:que|cual|cu[aá]l|dame|recomienda|sugiere)\b.*$/i, '')
        .trim();
      if (clean.length > 1) exclusions.push(clean);
    }
  }

  return exclusions.length > 0 ? [...new Set(exclusions)] : undefined;
}

export function extractSemanticQuery(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.includes('chico que come demonios') || normalized.includes('come demonios')) {
    return 'demon slayer';
  }
  if (normalized.includes('one for all') || normalized.includes('hereda poderes')) {
    return 'my hero academia';
  }
  if (normalized.includes('shingeky no kiojin') || normalized.includes('shingeki no kiojin')) {
    return 'shingeki no kyojin';
  }
  if (normalized.includes('heroe del escudo')) {
    return 'the rising of the shield hero';
  }
  if (normalized.includes('chica de pelo azul') && normalized.includes('rezero')) {
    return 're:zero';
  }
  if (normalized.includes('viaja en el tiempo') && normalized.includes('telefono')) {
    return 'steins;gate';
  }
  if (normalized.includes('carreras') && normalized.includes('montana') && normalized.includes('eurobeat')) {
    return 'initial d';
  }
  return undefined;
}
