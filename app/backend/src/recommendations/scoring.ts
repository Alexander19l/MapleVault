import { normalizeToneTags, toneTagLabel, toneTagMatchesCandidate } from './toneTags';

export interface RecommendationPreferenceProfile {
  requestedGenres: string[];
  requestedStudio?: string;
  requestedFormat?: string;
  requestedEpisodeLength?: string;
  requestedToneTags: string[];
  explicitFavoriteGenres: string[];
  inferredGenres: string[];
  dislikedGenres: string[];
  preferredStudios: string[];
  dislikedStudios: string[];
  preferredFormats: string[];
  dislikedFormats: string[];
  preferredToneTags: string[];
  dislikedToneTags: string[];
  preferredEpisodeLength: string;
  dislikedEpisodeLengths: string[];
  likedAnime: any[];
  dislikedAnime: any[];
  preferenceGenres: string[];
}

export interface RankedAnimeCandidate {
  [key: string]: any;
  recommendation_score: number;
  recommendation_reason: string;
  recommendation_factors: {
    genreMatches: number;
    dislikedMatches: number;
    studioMatch: number;
    dislikedStudioMatch: number;
    formatMatch: number;
    dislikedFormatMatch: number;
    durationMatch: number;
    dislikedDurationMatch: number;
    toneMatches: number;
    dislikedToneMatches: number;
    likedAnimeMatch: number;
    dislikedAnimeMatch: number;
    publicScore: number;
    userScore: number;
    popularityBonus: number;
    statusBonus: number;
  };
}

export function normalizeGenre(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function splitGenres(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeGenre).filter(Boolean))];
  }

  return [...new Set(String(value || '')
    .split(',')
    .map(normalizeGenre)
    .filter(Boolean))];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeGenre).filter(Boolean))];
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeTitleKey(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function animeFeedbackMatches(candidate: any, feedback: any): boolean {
  if (!feedback) return false;

  const candidateId = candidate.id ? Number(candidate.id) : undefined;
  const feedbackId = feedback.id ? Number(feedback.id) : undefined;
  if (candidateId && feedbackId && candidateId === feedbackId) return true;

  const candidateExternalId = candidate.external_id ? Number(candidate.external_id) : undefined;
  const feedbackExternalId = feedback.external_id ? Number(feedback.external_id) : undefined;
  const candidateSource = normalizeText(candidate.source);
  const feedbackSource = normalizeText(feedback.source);
  if (candidateExternalId && feedbackExternalId && candidateExternalId === feedbackExternalId && candidateSource === feedbackSource) {
    return true;
  }

  const candidateTitleKey = normalizeTitleKey(candidate.title || candidate.title_romaji || candidate.title_english);
  const feedbackTitleKey = normalizeTitleKey(feedback.titleKey || feedback.title || feedback.animeTitle);
  return Boolean(candidateTitleKey && feedbackTitleKey && candidateTitleKey === feedbackTitleKey);
}

function normalizeFormat(value: unknown): string {
  const normalized = normalizeText(value);
  if (['pelicula', 'película', 'movie', 'film'].includes(normalized)) return 'movie';
  if (['serie', 'series', 'tv'].includes(normalized)) return 'tv';
  return normalized;
}

function normalizeEpisodeLength(value: unknown): string {
  const normalized = normalizeText(value);
  if (['corta', 'corto', 'short'].includes(normalized)) return 'short';
  if (['larga', 'largo', 'long'].includes(normalized)) return 'long';
  if (['media', 'medio', 'medium'].includes(normalized)) return 'medium';
  return normalized;
}

function inferEpisodeLength(anime: any): string {
  const episodes = Number(anime.episodes) || 0;
  if (episodes > 0 && episodes <= 13) return 'short';
  if (episodes >= 25) return 'long';
  return 'medium';
}

export function buildRecommendationPreferenceProfile(input: {
  requestedGenre?: unknown;
  requestedStudio?: unknown;
  requestedFormat?: unknown;
  requestedEpisodeLength?: unknown;
  requestedToneTags?: unknown;
  requestedDislikedToneTags?: unknown;
  favoriteGenres?: unknown;
  favoriteStudios?: unknown;
  favoriteFormats?: unknown;
  favoriteToneTags?: unknown;
  dislikedGenres?: unknown;
  dislikedStudios?: unknown;
  dislikedFormats?: unknown;
  dislikedToneTags?: unknown;
  preferredEpisodeLength?: unknown;
  dislikedEpisodeLengths?: unknown;
  likedAnime?: unknown;
  dislikedAnime?: unknown;
  soulProfile?: any;
}): RecommendationPreferenceProfile {
  const requestedGenres = splitGenres(input.requestedGenre);
  const requestedStudio = normalizeText(input.requestedStudio) || undefined;
  const requestedFormat = normalizeFormat(input.requestedFormat) || undefined;
  const requestedEpisodeLength = normalizeEpisodeLength(input.requestedEpisodeLength) || undefined;
  const requestedToneTags = normalizeToneTags(input.requestedToneTags);
  const explicitFavoriteGenres = Array.isArray(input.favoriteGenres)
    ? unique(input.favoriteGenres.map(String))
    : [];

  const inferredGenres = Array.isArray(input.soulProfile?.inferredGenres)
    ? unique(input.soulProfile.inferredGenres.slice(0, 5).map((item: any) => item.genre))
    : [];

  const dislikedGenres = unique([
    ...(Array.isArray(input.dislikedGenres) ? input.dislikedGenres.map(String) : []),
    ...(Array.isArray(input.soulProfile?.dislikedGenres) ? input.soulProfile.dislikedGenres.map(String) : [])
  ]);

  const preferredStudios = unique([
    ...(requestedStudio ? [requestedStudio] : []),
    ...(Array.isArray(input.favoriteStudios) ? input.favoriteStudios.map(String) : []),
    ...(Array.isArray(input.soulProfile?.favoriteStudios) ? input.soulProfile.favoriteStudios.map(String) : [])
  ]);

  const dislikedStudios = unique([
    ...(Array.isArray(input.dislikedStudios) ? input.dislikedStudios.map(String) : []),
    ...(Array.isArray(input.soulProfile?.dislikedStudios) ? input.soulProfile.dislikedStudios.map(String) : [])
  ]);

  const preferredFormats = unique([
    ...(requestedFormat ? [requestedFormat] : []),
    ...(Array.isArray(input.favoriteFormats) ? input.favoriteFormats.map(normalizeFormat) : []),
    ...(Array.isArray(input.soulProfile?.favoriteFormats) ? input.soulProfile.favoriteFormats.map(normalizeFormat) : [])
  ]);

  const dislikedFormats = unique([
    ...(Array.isArray(input.dislikedFormats) ? input.dislikedFormats.map(normalizeFormat) : []),
    ...(Array.isArray(input.soulProfile?.dislikedFormats) ? input.soulProfile.dislikedFormats.map(normalizeFormat) : [])
  ]);

  const preferredToneTags = normalizeToneTags([
    ...requestedToneTags,
    ...(Array.isArray(input.favoriteToneTags) ? input.favoriteToneTags : []),
    ...(Array.isArray(input.soulProfile?.favoriteToneTags) ? input.soulProfile.favoriteToneTags : [])
  ]);

  const dislikedToneTags = normalizeToneTags([
    ...(Array.isArray(input.requestedDislikedToneTags) ? input.requestedDislikedToneTags : []),
    ...(Array.isArray(input.dislikedToneTags) ? input.dislikedToneTags : []),
    ...(Array.isArray(input.soulProfile?.dislikedToneTags) ? input.soulProfile.dislikedToneTags : [])
  ]);

  const preferredEpisodeLength = requestedEpisodeLength
    || normalizeEpisodeLength(input.preferredEpisodeLength)
    || normalizeEpisodeLength(input.soulProfile?.preferredEpisodeLength)
    || 'desconocido';

  const dislikedEpisodeLengths = unique([
    ...(Array.isArray(input.dislikedEpisodeLengths) ? input.dislikedEpisodeLengths.map(normalizeEpisodeLength) : []),
    ...(Array.isArray(input.soulProfile?.dislikedEpisodeLengths) ? input.soulProfile.dislikedEpisodeLengths.map(normalizeEpisodeLength) : [])
  ]);

  const likedAnime = [
    ...(Array.isArray(input.likedAnime) ? input.likedAnime : []),
    ...(Array.isArray(input.soulProfile?.likedAnime) ? input.soulProfile.likedAnime : [])
  ];

  const dislikedAnime = [
    ...(Array.isArray(input.dislikedAnime) ? input.dislikedAnime : []),
    ...(Array.isArray(input.soulProfile?.dislikedAnime) ? input.soulProfile.dislikedAnime : [])
  ];

  const preferenceGenres = unique([
    ...requestedGenres,
    ...explicitFavoriteGenres,
    ...inferredGenres
  ]);

  return {
    requestedGenres,
    requestedStudio,
    requestedFormat,
    requestedEpisodeLength,
    requestedToneTags,
    explicitFavoriteGenres,
    inferredGenres,
    dislikedGenres,
    preferredStudios,
    dislikedStudios,
    preferredFormats,
    dislikedFormats,
    preferredToneTags,
    dislikedToneTags,
    preferredEpisodeLength,
    dislikedEpisodeLengths,
    likedAnime,
    dislikedAnime,
    preferenceGenres
  };
}

export function rankAnimeCandidates(
  candidates: any[],
  options: {
    preferenceGenres?: string[];
    dislikedGenres?: string[];
    preferredStudios?: string[];
    dislikedStudios?: string[];
    preferredFormats?: string[];
    dislikedFormats?: string[];
    preferredToneTags?: string[];
    dislikedToneTags?: string[];
    preferredEpisodeLength?: string;
    dislikedEpisodeLengths?: string[];
    likedAnime?: any[];
    dislikedAnime?: any[];
    limit?: number;
  } = {}
): RankedAnimeCandidate[] {
  const preferenceGenres = unique(options.preferenceGenres || []);
  const dislikedGenres = new Set(unique(options.dislikedGenres || []));
  const preferredStudios = new Set(unique(options.preferredStudios || []));
  const dislikedStudios = new Set(unique(options.dislikedStudios || []));
  const preferredFormats = new Set(unique((options.preferredFormats || []).map(normalizeFormat)));
  const dislikedFormats = new Set(unique((options.dislikedFormats || []).map(normalizeFormat)));
  const preferredToneTags = normalizeToneTags(options.preferredToneTags || []);
  const dislikedToneTags = normalizeToneTags(options.dislikedToneTags || []);
  const preferredEpisodeLength = normalizeEpisodeLength(options.preferredEpisodeLength);
  const dislikedEpisodeLengths = new Set(unique((options.dislikedEpisodeLengths || []).map(normalizeEpisodeLength)));
  const likedAnime = options.likedAnime || [];
  const dislikedAnime = options.dislikedAnime || [];
  const limit = options.limit ?? 5;

  return candidates
    .map((anime: any) => {
      const animeGenres = splitGenres(anime.genres_joined || anime.genres);
      const studio = normalizeText(anime.studio);
      const format = normalizeFormat(anime.type || anime.format);
      const episodeLength = inferEpisodeLength(anime);
      const genreMatches = preferenceGenres.filter(genre => animeGenres.includes(genre)).length;
      const dislikedMatches = animeGenres.filter(genre => dislikedGenres.has(genre)).length;
      const studioMatch = studio && preferredStudios.has(studio) ? 1 : 0;
      const dislikedStudioMatch = studio && dislikedStudios.has(studio) ? 1 : 0;
      const formatMatch = format && preferredFormats.has(format) ? 1 : 0;
      const dislikedFormatMatch = format && dislikedFormats.has(format) ? 1 : 0;
      const durationMatch = preferredEpisodeLength && preferredEpisodeLength !== 'desconocido' && episodeLength === preferredEpisodeLength ? 1 : 0;
      const dislikedDurationMatch = dislikedEpisodeLengths.has(episodeLength) ? 1 : 0;
      const candidateText = [
        anime.title,
        anime.title_romaji,
        anime.title_english,
        anime.genres_joined,
        anime.genres,
        anime.synopsis,
        anime.description
      ].filter(Boolean).join(' ');
      const toneMatches = preferredToneTags.filter(tag => toneTagMatchesCandidate(tag, candidateText)).length;
      const dislikedToneMatches = dislikedToneTags.filter(tag => toneTagMatchesCandidate(tag, candidateText)).length;
      const likedAnimeMatch = likedAnime.some(feedback => animeFeedbackMatches(anime, feedback)) ? 1 : 0;
      const dislikedAnimeMatch = dislikedAnime.some(feedback => animeFeedbackMatches(anime, feedback)) ? 1 : 0;
      const userScore = Number(anime.user_score) || 0;
      const publicScore = Number(anime.score) || 0;
      const popularityBonus = Math.min(Number(anime.popularity) || 0, 100000) / 10000;
      const statusBonus = anime.watch_status === 'plan_to_watch'
        ? 8
        : anime.watch_status === 'watching'
          ? 5
          : 0;
      const droppedPenalty = anime.watch_status === 'dropped' ? 20 : 0;

      const score = (genreMatches * 35)
        + (studioMatch * 12)
        + (formatMatch * 8)
        + (durationMatch * 8)
        + (toneMatches * 14)
        + (likedAnimeMatch * 20)
        + userScore
        + (publicScore * 2)
        + popularityBonus
        + statusBonus
        - (dislikedMatches * 30)
        - (dislikedStudioMatch * 35)
        - (dislikedFormatMatch * 25)
        - (dislikedDurationMatch * 12)
        - (dislikedToneMatches * 28)
        - (dislikedAnimeMatch * 200)
        - droppedPenalty;

      const reasonParts = [
        genreMatches > 0 ? `coincide con ${genreMatches} genero(s) de tu solicitud o preferencias` : '',
        studioMatch ? `coincide con tu estudio preferido ${anime.studio}` : '',
        formatMatch ? `coincide con tu formato preferido ${format}` : '',
        durationMatch ? `coincide con tu duracion preferida ${episodeLength}` : '',
        toneMatches > 0 ? `coincide con tono ${preferredToneTags.filter(tag => toneTagMatchesCandidate(tag, candidateText)).map(toneTagLabel).join(', ')}` : '',
        likedAnimeMatch ? 'ya la marcaste como una serie que te gusto' : ''
      ].filter(Boolean);

      const reason = reasonParts.length > 0
        ? reasonParts.join('; ')
        : publicScore > 0 || popularityBonus > 0 || statusBonus > 0
          ? 'destaca por score, popularidad o estado en tu biblioteca'
          : 'queda como candidato local sin suficientes senales de preferencia';

      return {
        ...anime,
        recommendation_score: Math.round(score * 100) / 100,
        recommendation_reason: reason,
        recommendation_factors: {
          genreMatches,
          dislikedMatches,
          studioMatch,
          dislikedStudioMatch,
          formatMatch,
          dislikedFormatMatch,
          durationMatch,
          dislikedDurationMatch,
          toneMatches,
          dislikedToneMatches,
          likedAnimeMatch,
          dislikedAnimeMatch,
          publicScore,
          userScore,
          popularityBonus: Math.round(popularityBonus * 100) / 100,
          statusBonus
        }
      };
    })
    .sort((a, b) => b.recommendation_score - a.recommendation_score)
    .slice(0, limit);
}
