import { query } from '../database/db';
import { buildRecommendationPreferenceProfile, rankAnimeCandidates } from '../recommendations/scoring';
import { decorateAnimeListWithSpanishTranslation } from '../translation/translationService';
import { decorateResult, normalizeTitleKey } from './animeResultUtils';
import type { ChatResponse } from './chatResponse';
import {
  getRecentRecommendedAnime,
  getRecommendationMemoryPreferences,
  getUserSoulData,
  rememberRecommendedAnime
} from './memory';
import { searchOnlineSources } from './onlineAnimeSearch';
import { getAnimeGenreNames, resolveReferenceOrTitleOrOnline } from './referenceResolver';
import { startPagedAnimeResults } from './resultPagination';
import type { NLPResult } from './types';

export async function handleRecommendSimilar(entities: NLPResult['entities']): Promise<ChatResponse> {
  const reference = entities.refIndexOrTitle || entities.animeTitle || entities.query;
  const target = await resolveReferenceOrTitleOrOnline(reference);

  if (!target) {
    return { text: `No capto la serie de referencia "${reference || ''}". Búscala primero o escribe el título con más detalle para recomendar algo parecido.` };
  }

  const targetGenres = await getAnimeGenreNames(target);
  if (targetGenres.length === 0) {
    return { text: `Encontré "${target.title}", pero no tengo géneros verificados para calcular similitud. Probemos con otra referencia.` };
  }

  const recentRecommendedAnime = await getRecentRecommendedAnime();
  const candidates = await query.all(`
    SELECT a.*, ul.watch_status, ul.user_score, GROUP_CONCAT(g.name) as genres_joined
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    LEFT JOIN anime_genres ag ON a.id = ag.anime_id
    LEFT JOIN genres g ON ag.genre_id = g.id
    WHERE (ul.watch_status IS NULL OR ul.watch_status = 'plan_to_watch')
      AND (? IS NULL OR a.id <> ?)
    GROUP BY a.id
    LIMIT 150
  `, [target.id || null, target.id || null]);

  const rankedRaw = rankAnimeCandidates(candidates, {
    preferenceGenres: targetGenres,
    preferredFormats: target.type ? [target.type] : [],
    likedAnime: [target],
    dislikedAnime: recentRecommendedAnime,
    limit: 24
  }).map(anime => decorateResult(anime, 'local'));

  const ranked = await decorateAnimeListWithSpanishTranslation(rankedRaw, { maxRowsToTranslate: 12 });

  if (ranked.length > 0) {
    await rememberRecommendedAnime(ranked);
    const paged = await startPagedAnimeResults({
      mode: 'similar',
      label: `Series similares a ${target.title}`,
      items: ranked
    });
    const reasons = ranked.map((anime: any, index: number) => `${index + 1}. ${anime.title}: comparte géneros con ${target.title} (${targetGenres.join(', ')}).`).join('\n');
    return {
      text: `Si te interesa algo como **${target.title}**, buscaria por ${targetGenres.join(', ')}:\n${reasons}`,
      visualData: paged.visualData
    };
  }

  const onlineRecommendations = await searchOnlineSources(targetGenres[0]);
  if (onlineRecommendations.length > 0) {
    const onlineSlice = onlineRecommendations
      .filter(anime => normalizeTitleKey(anime.title) !== normalizeTitleKey(target.title))
      .slice(0, 10);
    await rememberRecommendedAnime(onlineSlice);
    const paged = await startPagedAnimeResults({
      mode: 'similar',
      label: `Opciones online similares a ${target.title}`,
      items: onlineSlice
    });
    return {
      text: `No encontré suficientes candidatos locales similares a **${target.title}**. Estas opciones online coinciden con ${targetGenres[0]}.`,
      visualData: paged.visualData
    };
  }

  return { text: `No encontré recomendaciones similares confiables para **${target.title}** por ahora.` };
}

export async function handleRecommendGeneral(entities: NLPResult['entities']): Promise<ChatResponse> {
  const memoryPreferences = await getRecommendationMemoryPreferences();
  const soulProfile = await getUserSoulData();
  const recentRecommendedAnime = await getRecentRecommendedAnime();
  const explicitExcludedAnime = (entities.exclude_titles || []).map(title => ({
    title,
    titleKey: normalizeTitleKey(title)
  }));
  const preferenceProfile = buildRecommendationPreferenceProfile({
    requestedGenre: entities.genre,
    requestedStudio: entities.studio,
    requestedFormat: entities.format,
    requestedEpisodeLength: entities.durationPreference,
    requestedToneTags: entities.toneTags,
    requestedDislikedToneTags: entities.dislikedToneTags,
    favoriteGenres: memoryPreferences.favoriteGenres,
    favoriteStudios: memoryPreferences.favoriteStudios,
    favoriteFormats: memoryPreferences.favoriteFormats,
    favoriteToneTags: memoryPreferences.favoriteToneTags,
    dislikedGenres: [...memoryPreferences.dislikedGenres, ...(entities.exclude_tags || [])],
    dislikedStudios: memoryPreferences.dislikedStudios,
    dislikedFormats: memoryPreferences.dislikedFormats,
    dislikedToneTags: memoryPreferences.dislikedToneTags,
    preferredEpisodeLength: memoryPreferences.preferredEpisodeLength,
    dislikedEpisodeLengths: memoryPreferences.dislikedEpisodeLengths,
    likedAnime: memoryPreferences.likedAnime,
    dislikedAnime: [...memoryPreferences.dislikedAnime, ...recentRecommendedAnime, ...explicitExcludedAnime],
    soulProfile
  });

  const rememberedEras = Object.values((memoryPreferences as any).preferredEras || {}) as Array<{ year_from: number; year_to: number; weight: number }>;
  const preferredEra = rememberedEras.sort((a, b) => Number(b.weight) - Number(a.weight))[0];
  const candidateConditions = [`(ul.watch_status IS NULL OR ul.watch_status = 'plan_to_watch')`];
  const candidateParams: any[] = [];

  const yearFrom = entities.year_from || preferredEra?.year_from;
  const yearTo = entities.year_to || preferredEra?.year_to;
  if (yearFrom) {
    candidateConditions.push('a.year >= ?');
    candidateParams.push(yearFrom);
  }
  if (yearTo) {
    candidateConditions.push('a.year <= ?');
    candidateParams.push(yearTo);
  }
  if (entities.min_score !== undefined) {
    candidateConditions.push('a.score >= ?');
    candidateParams.push(entities.min_score);
  }
  if (entities.min_episodes !== undefined) {
    candidateConditions.push('COALESCE(a.episodes, 0) >= ?');
    candidateParams.push(entities.min_episodes);
  }
  if (entities.max_episodes !== undefined) {
    candidateConditions.push('a.episodes IS NOT NULL AND a.episodes > 0 AND a.episodes <= ?');
    candidateParams.push(entities.max_episodes);
  }
  if (entities.duration_max !== undefined) {
    candidateConditions.push('a.duration IS NOT NULL AND a.duration > 0 AND a.duration <= ?');
    candidateParams.push(entities.duration_max);
  }
  if (entities.airing_status === 'finished') {
    candidateConditions.push(`LOWER(COALESCE(a.status, '')) IN ('finished', 'completed', 'complete', 'finished airing')`);
  }

  for (const excludedRoot of [entities.exclude_franchise, entities.exclude_related_to].filter(Boolean)) {
    const like = `%${String(excludedRoot).toLowerCase()}%`;
    candidateConditions.push(`(
      LOWER(COALESCE(a.title, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_romaji, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_english, '')) NOT LIKE ?
    )`);
    candidateParams.push(like, like, like);
  }

  for (const tag of entities.tags || []) {
    const like = `%${String(tag).toLowerCase()}%`;
    candidateConditions.push(`(
      LOWER(COALESCE(a.title, '')) LIKE ?
      OR LOWER(COALESCE(a.title_romaji, '')) LIKE ?
      OR LOWER(COALESCE(a.title_english, '')) LIKE ?
      OR LOWER(COALESCE(a.synopsis, '')) LIKE ?
      OR EXISTS (
        SELECT 1 FROM anime_genres art
        JOIN genres grt ON art.genre_id = grt.id
        WHERE art.anime_id = a.id AND LOWER(grt.name) LIKE ?
      )
    )`);
    candidateParams.push(like, like, like, like, like);
  }

  for (const excludedTag of entities.exclude_tags || []) {
    const like = `%${String(excludedTag).toLowerCase()}%`;
    candidateConditions.push(`(
      LOWER(COALESCE(a.title, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_romaji, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.title_english, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.synopsis, '')) NOT LIKE ?
      AND LOWER(COALESCE(a.age_rating, '')) NOT LIKE ?
    )`);
    candidateParams.push(like, like, like, like, like);
  }

  const candidates = await query.all(`
    SELECT a.*, ul.watch_status, ul.user_score, GROUP_CONCAT(g.name) as genres_joined
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    LEFT JOIN anime_genres ag ON a.id = ag.anime_id
    LEFT JOIN genres g ON ag.genre_id = g.id
    WHERE ${candidateConditions.join(' AND ')}
    GROUP BY a.id
    LIMIT 100
  `, candidateParams);

  const rankedRaw = rankAnimeCandidates(candidates, {
    preferenceGenres: preferenceProfile.preferenceGenres,
    dislikedGenres: preferenceProfile.dislikedGenres,
    preferredStudios: preferenceProfile.preferredStudios,
    dislikedStudios: preferenceProfile.dislikedStudios,
    preferredFormats: preferenceProfile.preferredFormats,
    dislikedFormats: preferenceProfile.dislikedFormats,
    preferredToneTags: preferenceProfile.preferredToneTags,
    dislikedToneTags: preferenceProfile.dislikedToneTags,
    preferredEpisodeLength: preferenceProfile.preferredEpisodeLength,
    dislikedEpisodeLengths: preferenceProfile.dislikedEpisodeLengths,
    likedAnime: preferenceProfile.likedAnime,
    dislikedAnime: preferenceProfile.dislikedAnime,
    limit: 24
  }).map(anime => decorateResult(anime, 'local'));
  const ranked = await decorateAnimeListWithSpanishTranslation(rankedRaw, { maxRowsToTranslate: 12 });

  if (ranked.length > 0) {
    await rememberRecommendedAnime(ranked);
    const paged = await startPagedAnimeResults({
      mode: 'recommendation',
      label: 'Recomendaciones para ti',
      items: ranked
    });
    const reasons = ranked.map((anime: any, index: number) => `${index + 1}. ${anime.title}: ${anime.recommendation_reason}.`).join('\n');
    return {
      text: `Te podría gustar:\n${reasons}`,
      visualData: paged.visualData
    };
  }

  const onlineQuery = preferenceProfile.preferenceGenres[0] || 'anime';
  const onlineRecommendations = await searchOnlineSources(onlineQuery);
  if (onlineRecommendations.length > 0) {
    const onlineSlice = onlineRecommendations.slice(0, 10);
    await rememberRecommendedAnime(onlineSlice);
    const paged = await startPagedAnimeResults({
      mode: 'recommendation',
      label: 'Recomendaciones online',
      items: onlineSlice
    });
    return {
      text: `No encontré suficientes candidatos locales. Estas opciones online pueden servir como punto de partida para "${onlineQuery}".`,
      visualData: paged.visualData
    };
  }

  return { text: 'No tengo suficientes datos para recomendar con confianza. Decime uno o dos géneros que te interesen.' };
}
