import { isAnimeTitleMatch } from './animeTitleMatching';

export interface LocalAnimeIdentity {
  external_id?: number | null;
  source?: string | null;
  mal_id?: number | null;
  title?: string | null;
  title_romaji?: string | null;
  title_english?: string | null;
  year?: number | null;
  type?: string | null;
}

export interface AnimeAV1Identity {
  title: string;
  malId: number | null;
  startDate: string | null;
  category: {
    name: string;
    slug: string;
  } | null;
}

export type AnimeAV1IdentityReason =
  | 'mal_id_match'
  | 'mal_id_mismatch'
  | 'title_mismatch'
  | 'year_mismatch'
  | 'type_mismatch'
  | 'corroborated_metadata'
  | 'insufficient_metadata';

export interface AnimeAV1IdentityValidation {
  matches: boolean;
  reason: AnimeAV1IdentityReason;
  expectedMalId: number | null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getExpectedMalId(anime: LocalAnimeIdentity): number | null {
  const storedMalId = toPositiveInteger(anime.mal_id);
  if (storedMalId) return storedMalId;

  const source = String(anime.source || '').toLowerCase();
  if (source.includes('myanimelist') || source === 'mal' || source.includes('jikan')) {
    return toPositiveInteger(anime.external_id);
  }

  return null;
}

function parseYear(value: unknown): number | null {
  const match = String(value || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function normalizeLocalType(value: unknown): string | null {
  const type = String(value || '').toLowerCase().trim();
  if (!type) return null;
  if (type === 'tv' || type === 'tv_special') return 'tv';
  if (type === 'movie' || type === 'pelicula') return 'movie';
  if (type === 'ova') return 'ova';
  if (type === 'ona') return 'ona';
  if (type === 'special') return 'special';
  return type;
}

function normalizeProviderType(category: AnimeAV1Identity['category']): string | null {
  const value = `${category?.slug || ''} ${category?.name || ''}`.toLowerCase();
  if (!value.trim()) return null;
  if (value.includes('pelicula') || value.includes('movie')) return 'movie';
  if (value.includes('tv')) return 'tv';
  if (value.includes('ona')) return 'ona';
  if (value.includes('ova')) return 'ova';
  if (value.includes('special') || value.includes('especial')) return 'special';
  return null;
}

export function validateAnimeAV1Identity(
  anime: LocalAnimeIdentity,
  media: AnimeAV1Identity
): AnimeAV1IdentityValidation {
  const expectedMalId = getExpectedMalId(anime);
  const providerMalId = toPositiveInteger(media.malId);

  if (expectedMalId && providerMalId) {
    return {
      matches: expectedMalId === providerMalId,
      reason: expectedMalId === providerMalId ? 'mal_id_match' : 'mal_id_mismatch',
      expectedMalId
    };
  }

  const aliases = [anime.title, anime.title_romaji, anime.title_english]
    .filter((title): title is string => typeof title === 'string' && title.trim().length > 0);
  if (!isAnimeTitleMatch(aliases, media.title)) {
    return { matches: false, reason: 'title_mismatch', expectedMalId };
  }

  let corroboratedFields = 0;
  const localYear = toPositiveInteger(anime.year);
  const providerYear = parseYear(media.startDate);
  if (localYear && providerYear) {
    if (localYear !== providerYear) {
      return { matches: false, reason: 'year_mismatch', expectedMalId };
    }
    corroboratedFields += 1;
  }

  const localType = normalizeLocalType(anime.type);
  const providerType = normalizeProviderType(media.category);
  if (localType && providerType) {
    if (localType !== providerType) {
      return { matches: false, reason: 'type_mismatch', expectedMalId };
    }
    corroboratedFields += 1;
  }

  if (corroboratedFields === 0) {
    return { matches: false, reason: 'insufficient_metadata', expectedMalId };
  }

  return { matches: true, reason: 'corroborated_metadata', expectedMalId };
}
