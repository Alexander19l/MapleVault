export type ToneTagId =
  | 'dark'
  | 'emotional'
  | 'relaxing'
  | 'intense_action'
  | 'light_comedy'
  | 'slow_paced'
  | 'romance_focus'
  | 'gore';

export interface ToneTagDefinition {
  id: ToneTagId;
  label: string;
  keywords: string[];
}

export const TONE_TAGS: ToneTagDefinition[] = [
  {
    id: 'dark',
    label: 'oscuro',
    keywords: ['oscuro', 'oscura', 'dark', 'sombrio', 'sombria', 'horror', 'terror', 'thriller', 'psychological', 'psicologico', 'mystery', 'misterio']
  },
  {
    id: 'emotional',
    label: 'emocional',
    keywords: ['emocional', 'emotivo', 'emotiva', 'drama', 'dramatico', 'triste', 'llorar', 'tearjerker']
  },
  {
    id: 'relaxing',
    label: 'relajado',
    keywords: ['relajado', 'relajada', 'relajante', 'tranquilo', 'tranquila', 'calmado', 'calmada', 'slice of life', 'iyashikei', 'cotidiano']
  },
  {
    id: 'intense_action',
    label: 'accion intensa',
    keywords: ['accion intensa', 'mucha accion', 'peleas', 'combates', 'batallas', 'action', 'shounen', 'adrenalina']
  },
  {
    id: 'light_comedy',
    label: 'comedia ligera',
    keywords: ['comedia ligera', 'ligero', 'ligera', 'divertido', 'divertida', 'comedy', 'humor', 'romcom']
  },
  {
    id: 'slow_paced',
    label: 'ritmo lento',
    keywords: ['ritmo lento', 'lento', 'lenta', 'pausado', 'pausada', 'slow burn']
  },
  {
    id: 'romance_focus',
    label: 'romance',
    keywords: ['romance', 'romantico', 'romantica', 'romantic', 'romcom']
  },
  {
    id: 'gore',
    label: 'gore',
    keywords: ['gore', 'sangre', 'sangriento', 'sangrienta', 'violencia explicita']
  }
];

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeToneTag(value: unknown): ToneTagId | undefined {
  const normalized = normalizeText(value);
  return TONE_TAGS.find(tag =>
    tag.id === normalized || normalizeText(tag.label) === normalized || tag.keywords.some(keyword => normalizeText(keyword) === normalized)
  )?.id;
}

export function toneTagLabel(value: unknown): string {
  const id = normalizeToneTag(value);
  return TONE_TAGS.find(tag => tag.id === id)?.label || String(value || '').trim();
}

export function normalizeToneTags(values: unknown): ToneTagId[] {
  if (!Array.isArray(values)) return [];
  return unique(values.map(value => normalizeToneTag(value)).filter(Boolean) as string[]) as ToneTagId[];
}

export function extractToneTagEntities(message: string): { preferredToneTags: ToneTagId[]; dislikedToneTags: ToneTagId[] } {
  const normalized = normalizeText(message);
  const dislikedToneTags: ToneTagId[] = [];
  const preferredToneTags: ToneTagId[] = [];

  for (const tag of TONE_TAGS) {
    const matches = tag.keywords.some(keyword => normalized.includes(normalizeText(keyword)));
    if (!matches) continue;

    const negative = tag.keywords.some(keyword => {
      const key = normalizeText(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b(?:sin|evita|evitar|no quiero|no me recomiendes|no recomiendes|no me sugieras|no me gusta|odio)\\b.{0,28}\\b${key}\\b`).test(normalized);
    });

    if (negative) dislikedToneTags.push(tag.id);
    else preferredToneTags.push(tag.id);
  }

  return {
    preferredToneTags: normalizeToneTags(preferredToneTags),
    dislikedToneTags: normalizeToneTags(dislikedToneTags)
  };
}

export function toneTagMatchesCandidate(tagId: unknown, candidateText: unknown): boolean {
  const id = normalizeToneTag(tagId);
  const tag = TONE_TAGS.find(item => item.id === id);
  if (!tag) return false;

  const normalized = normalizeText(candidateText);
  return tag.keywords.some(keyword => normalized.includes(normalizeText(keyword)));
}
