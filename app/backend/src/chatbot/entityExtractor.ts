import type { NLPResult } from './types';
import { escapeRegExp, normalizeEntityText } from './nlpText';
import {
  ANIME_GENRE_DEFINITIONS,
  ANIME_TAG_DEFINITIONS,
  findDefinitionValues
} from './entityDictionaries';

export { normalizeEntityText } from './nlpText';

export function normalizeStatusEntity(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(viendo|watching|en progreso)\b/)) return 'watching';
  if (normalized.match(/\b(pendiente|pendientes|plan to watch|quiero ver)\b/)) return 'plan_to_watch';
  if (normalized.match(/\b(completado|completada|terminado|terminada|completed)\b/)) return 'completed';
  if (normalized.match(/\b(abandonado|abandonada|dropped)\b/)) return 'dropped';
  if (normalized.match(/\b(pausado|pausada|on hold|on_hold)\b/)) return 'on_hold';
  if (normalized.match(/\bvistas?\b/)) return 'completed';
  return undefined;
}

export function normalizeFormatEntity(message: string): NLPResult['entities']['format'] | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(pelicula|peliculas|movie|movies|film|films|largometraje|largometrajes|cinta|cintas)\b/)) return 'movie';
  if (normalized.match(/\b(ova|ovas)\b/)) return 'ova';
  if (normalized.match(/\b(ona)\b/)) return 'ona';
  if (normalized.match(/\b(especial|special)\b/)) return 'special';
  if (normalized.match(/\b(videos? musicales?|music videos?|animated music videos?)\b/)) return 'music';
  if (normalized.match(/\b(donghua)\b/)) return 'donghua';
  if (normalized.match(/\b(tv|anime|serie|series)\b/) && !normalized.match(/\b(series?\s+(corta|corto|larga|largo))\b/)) return 'tv';
  return undefined;
}

export function normalizeDurationPreference(message: string): NLPResult['entities']['durationPreference'] | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(corta|corto|cortas|cortos|short|pocos episodios|pocas temporadas|poco tiempo|rapida|rapido|fin de semana|maraton corta)\b/)) return 'short';
  if (normalized.match(/\b(larga|largo|largas|largos|long|long running|muchos episodios|muchas temporadas|extensa|extenso)\b/)) return 'long';
  if (normalized.match(/\b(media|medio|normal|moderada|moderado)\b/)) return 'medium';
  return undefined;
}

export function extractEpisodeLimitEntities(message: string): Pick<NLPResult['entities'], 'min_episodes' | 'max_episodes'> {
  const normalized = normalizeEntityText(message);
  const exactRange = normalized.match(/\b(?:exactamente|exactly)\s+(\d{1,3})\s+(?:o|or|y|and|a|-)\s+(\d{1,3})\s+(?:episodios|capitulos|eps?)\b/);
  if (exactRange) {
    const values = [Number(exactRange[1]), Number(exactRange[2])].sort((a, b) => a - b);
    return { min_episodes: values[0], max_episodes: values[1] };
  }

  const maxMatch = normalized.match(/\b(?:maximo|max|hasta|menos de|no mas de)\s+(\d{1,3})\s+(?:episodios|capitulos|eps?)\b/);
  if (maxMatch) return { max_episodes: Number(maxMatch[1]) };

  const minMatch = normalized.match(/\b(?:minimo|min|mas de)\s+(\d{1,3})\s+(?:episodios|capitulos|eps?)\b/);
  if (minMatch) return { min_episodes: Number(minMatch[1]) };

  const duration = normalizeDurationPreference(message);
  if (duration === 'short') return { max_episodes: 13 };
  if (duration === 'medium') return { min_episodes: 14, max_episodes: 26 };
  if (duration === 'long') return { min_episodes: 25 };
  return {};
}

export function extractScoreEntities(message: string): Pick<NLPResult['entities'], 'min_score' | 'max_score' | 'score'> {
  const normalized = normalizeEntityText(message).replace(',', '.');
  const hasScoreContext = /\b(nota|puntuacion|calificacion|score|rating|rated)\b/.test(normalized);
  const between = normalized.match(/\b(?:entre|from|between)\s+(\d+(?:\.\d+)?)\s+(?:y|and|a|-)\s+(\d+(?:\.\d+)?)\b/);
  if (between && hasScoreContext) {
    return {
      min_score: Number(between[1]),
      max_score: Number(between[2])
    };
  }

  const minimum = normalized.match(/\b(?:mas de|mayor a|mayor que|minimo|minima|above|over|more than)\s+(\d+(?:\.\d+)?)/);
  if (minimum && hasScoreContext) {
    const value = Number(minimum[1]);
    return { min_score: value, score: value };
  }

  const plus = normalized.match(/\b(\d+(?:\.\d+)?)\+\b/);
  if (plus) {
    const value = Number(plus[1]);
    return { min_score: value, score: value };
  }

  return {};
}

export function extractRegionalIntensityEntities(message: string): Pick<NLPResult['entities'], 'min_score'> {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(?:bravazo|bravo|epico|epica|joya|buenazo|calidad|highly rated|chido|piola|mola|mole|mogollon)\b/)) {
    return { min_score: 8 };
  }
  return {};
}

export function extractRelativeYearEntities(message: string): Pick<NLPResult['entities'], 'year_from' | 'year_to'> {
  const normalized = normalizeEntityText(message);
  const currentYear = new Date().getFullYear();
  const exactRange = normalized.match(/\b(?:exactamente\s+)?(?:entre|from)\s+(19\d{2}|20\d{2})\s+(?:y|and|a|-)\s+(19\d{2}|20\d{2})\b/);
  if (exactRange) {
    const values = [Number(exactRange[1]), Number(exactRange[2])].sort((a, b) => a - b);
    return { year_from: values[0], year_to: values[1] };
  }

  const olderThan = normalized.match(/\b(?:anteriores?\s+a|antes\s+de|older than)\s+(19\d{2}|20\d{2})\b/);
  if (olderThan) return { year_to: Number(olderThan[1]) };

  const recentYears = normalized.match(/\b(?:ultimos|ultimas|last)\s+(\d{1,2})\s+(?:anos|anios|years)\b/);
  if (recentYears) {
    const amount = Math.max(1, Number(recentYears[1]));
    return { year_from: currentYear - amount + 1, year_to: currentYear };
  }

  const decade = normalized.match(/\b(?:los\s+)?((?:19|20)\d0|[89]0)s?\b/);
  if (decade) {
    let start = Number(decade[1]);
    if (start < 100) start += start <= 30 ? 2000 : 1900;
    return { year_from: start, year_to: start + 9 };
  }

  if (normalized.match(/\bnoventa\b/)) return { year_from: 1990, year_to: 1999 };

  return {};
}

export function extractDurationEntities(message: string): Pick<NLPResult['entities'], 'duration_max'> {
  const normalized = normalizeEntityText(message);
  const maxDuration = normalized.match(/\b(?:menos de|under|hasta|maximo)\s+(\d{1,3})\s+minutos?\b/);
  return maxDuration ? { duration_max: Number(maxDuration[1]) } : {};
}

export function extractSortEntity(message: string): NLPResult['entities']['sort_by'] | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(peor nota|menor nota|score ascendente|lowest rated)\b/)) return 'score_asc';
  if (normalized.match(/\b(mejor nota|mayor nota|score descendente|highest rated|highly rated)\b/)) return 'score_desc';
  if (normalized.match(/\b(fecha de lanzamiento|release date).*\b(ascendente|antiguos primero|oldest first)\b/)) return 'release_date_asc';
  if (normalized.match(/\b(fecha de lanzamiento|release date).*\b(descendente|recientes primero|newest first)\b/)) return 'release_date_desc';
  return undefined;
}

export function extractAiringStatusEntity(message: string): NLPResult['entities']['airing_status'] | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(archivadas|finalizadas|finalizados|completitas|finished airing|finished)\b/)) return 'finished';
  if (normalized.match(/\b(en emision|airing|currently airing)\b/)) return 'airing';
  if (normalized.match(/\b(proximamente|upcoming)\b/)) return 'upcoming';
  return undefined;
}

export function extractStaffEntities(message: string): Pick<NLPResult['entities'], 'staff' | 'staff_role'> {
  const normalized = normalizeEntityText(message);
  const knownStaff = ['makoto shinkai', 'satoshi kon', 'hiroshi kamiya', 'eiichiro oda'];
  const staff = knownStaff.find(name => normalized.includes(name));
  if (!staff) return {};

  let staffRole: NLPResult['entities']['staff_role'];
  if (normalized.match(/\b(director|dirigio|dirigidas?)\b/)) staffRole = 'director';
  if (normalized.match(/\b(seiyuu|voice actor|actor de voz)\b/)) staffRole = 'voice_actor';
  if (normalized.match(/\b(creador original|original creator)\b/)) staffRole = 'original_creator';
  return { staff, ...(staffRole ? { staff_role: staffRole } : {}) };
}

export function extractSourceMaterialEntity(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  if (normalized.match(/\b(light novel|novela ligera)\b/)) return 'light_novel';
  if (normalized.match(/\b(manga)\b/)) return 'manga';
  if (normalized.match(/\b(video game|videojuego)\b/)) return 'video_game';
  return undefined;
}

export function extractDemographicEntity(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  return ['shounen', 'shonen', 'seinen', 'shoujo', 'shojo', 'josei']
    .find(value => new RegExp(`\\b${value}\\b`).test(normalized))
    ?.replace('shonen', 'shounen')
    .replace('shojo', 'shoujo');
}

export function extractFranchiseExclusions(message: string): Pick<NLPResult['entities'], 'exclude_franchise' | 'exclude_related_to'> {
  const normalized = normalizeEntityText(message);
  const franchise = normalized.match(/\b(?:nada del universo de|ninguna variante de|excluye la franquicia)\s+([^,?.!]+?)(?:\s+ni\b|$)/);
  if (franchise?.[1]) return { exclude_franchise: franchise[1].trim() };

  if (normalized.includes('quintillizas') && normalized.match(/\b(no sea la primera|ni las peliculas|otra distinta)\b/)) {
    return { exclude_related_to: '5-toubun no hanayome' };
  }

  const related = normalized.match(/\b(?:nada parecido a|nada similar a|no me des nada parecido a)\s+([^,?.!]+)/);
  return related?.[1] ? { exclude_related_to: related[1].trim() } : {};
}

export function extractStudioEntity(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  const knownStudios = [
    'mappa', 'ufotable', 'ghibli', 'studio ghibli', 'madhouse', 'trigger', 'bones',
    'wit studio', 'kyoto animation', 'toei animation', 'pierrot', 'a-1 pictures',
    'cloverworks', 'production i.g'
  ];

  const known = knownStudios.find(studio => new RegExp(`(^|[^a-z0-9])${escapeRegExp(studio)}([^a-z0-9]|$)`).test(normalized));
  if (known) return known.replace(/^studio\s+/, '');

  const studioMatch = message.match(/\b(?:estudio|studio)\s+([a-z0-9 .&'_-]{2,40})/i);
  if (!studioMatch?.[1]) return undefined;

  return studioMatch[1]
    .replace(/\s+(y|con|pero|para|como|de|del|que|si|cuando)\b.*$/i, '')
    .trim();
}

export function extractGenreEntity(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  const found = findDefinitionValues(normalized, ANIME_GENRE_DEFINITIONS);
  return found.length > 0 ? [...new Set(found)].join(', ') : undefined;
}

export function extractTagEntities(message: string): Pick<NLPResult['entities'], 'tags' | 'exclude_tags'> {
  const normalized = normalizeEntityText(message);
  const tags = new Set(findDefinitionValues(normalized, ANIME_TAG_DEFINITIONS));
  const excludeTags = new Set<string>();

  if (message.match(/[\u{1F9DB}\u{1F987}\u{1F3F0}]/u)) tags.add('vampire');
  if (message.match(/[\u{1FA78}]/u)) tags.add('gore');
  if (message.match(/[\u{1F3F0}]/u) || normalized.includes('castillo')) tags.add('dark fantasy');
  if (normalized.match(/\b(?:hackers?|hacking|computadoras|ordenadores|terminales?|informatica|tecnologia)\b/)) tags.add('cyberpunk');
  if (normalized.match(/\b(?:harta accion|mucha accion|full accion)\b/)) tags.add('intense action');
  if (normalized.match(/\b(?:bravazo|bravo|epico|epica|joya|buenazo)\b/)) tags.add('highly rated');

  if (normalized.match(/\b(?:no sea|no quiero|sin|evita|que no sea).{0,32}\b(?:ninos|infantil|kids|familiar|familia)\b/)) {
    excludeTags.add('kids');
    excludeTags.add('family');
  }

  if (normalized.match(/\b(?:sin|evita|no quiero|que no tenga).{0,32}\b(?:gore|sangre|sangriento)\b/)) {
    excludeTags.add('gore');
  }

  const genericExclusion = normalized.match(/\b(?:sin|without|exclude|excepto)\s+(?:nada\s+de\s+)?([a-z0-9 ]{2,24})\b/);
  if (genericExclusion?.[1]) {
    const excludedValues = findDefinitionValues(genericExclusion[1], ANIME_TAG_DEFINITIONS);
    for (const value of excludedValues) excludeTags.add(value);
  }

  for (const excludedTag of excludeTags) {
    tags.delete(excludedTag);
  }

  return {
    ...(tags.size > 0 ? { tags: Array.from(tags) } : {}),
    ...(excludeTags.size > 0 ? { exclude_tags: Array.from(excludeTags) } : {})
  };
}

export function extractComparisonEntities(message: string): Pick<NLPResult['entities'], 'title_1' | 'title_2'> {
  const normalized = normalizeEntityText(message);
  const match = normalized.match(/(?:cual es mejor|compara|comparame)\s*,?\s+(.+?)\s+(?:o|vs|versus)\s+(.+?)\??$/);
  if (!match?.[1] || !match?.[2]) return {};

  let title1 = match[1].replace(/\s+de\s+(19\d{2}|20\d{2})$/, '').trim();
  let title2 = match[2].trim();

  if (title1.includes('fullmetal alchemist') && title2 === 'brotherhood') {
    title1 = 'fullmetal alchemist';
    title2 = 'fullmetal alchemist: brotherhood';
  }

  return { title_1: title1, title_2: title2 };
}

export function extractFranchiseEntity(message: string): string | undefined {
  const normalized = normalizeEntityText(message);
  const match = normalized.match(/\b(?:orden|orden debo ver|en que orden debo ver|como veo|cronologia)\s+(?:de\s+)?(?:la\s+)?(?:saga\s+|franquicia\s+)?(.+?)\??$/);
  if (!match?.[1]) return undefined;
  return match[1].replace(/^(?:de|la|el)\s+/, '').trim();
}

export function extractSeasonNumbers(message: string): number[] | undefined {
  const normalized = normalizeEntityText(message);
  const seasonBlock = normalized.match(/\btemporadas?\s+([0-9y,\s]+)\b/);
  if (!seasonBlock?.[1]) return undefined;

  const values = seasonBlock[1]
    .split(/(?:y|,|\s)+/)
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0 && value <= 50);

  return values.length > 0 ? [...new Set(values)] : undefined;
}

export function removeGenreFromEntity(genreValue: string | undefined, genreToRemove: string): string | undefined {
  const remaining = String(genreValue || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => value !== genreToRemove);

  return remaining.length > 0 ? remaining.join(', ') : undefined;
}

export function hasStructuredPreferenceEntity(entities: NLPResult['entities']): boolean {
  return Boolean(
    entities.genre
    || entities.studio
    || entities.format
    || entities.formats?.length
    || entities.durationPreference
    || entities.min_episodes !== undefined
    || entities.max_episodes !== undefined
    || entities.duration_max !== undefined
    || entities.tags?.length
    || entities.exclude_tags?.length
    || entities.min_score !== undefined
    || entities.max_score !== undefined
    || entities.year_from !== undefined
    || entities.year_to !== undefined
    || entities.airing_status
    || entities.staff
    || entities.source_material
    || entities.sort_by
    || entities.exclude_origin
    || entities.toneTags?.length
    || entities.dislikedToneTags?.length
  );
}
