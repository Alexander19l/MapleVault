import { extractToneTagEntities } from '../recommendations/toneTags';
import {
  extractAiringStatusEntity,
  extractComparisonEntities,
  extractDemographicEntity,
  extractDurationEntities,
  extractEpisodeLimitEntities,
  extractFranchiseExclusions,
  extractFranchiseEntity,
  extractGenreEntity,
  extractRelativeYearEntities,
  extractRegionalIntensityEntities,
  extractScoreEntities,
  extractSeasonNumbers,
  extractSortEntity,
  extractSourceMaterialEntity,
  extractStaffEntities,
  extractStudioEntity,
  extractTagEntities,
  hasStructuredPreferenceEntity,
  normalizeDurationPreference,
  normalizeEntityText,
  normalizeFormatEntity,
  normalizeStatusEntity,
  removeGenreFromEntity
} from './entityExtractor';
import { isGreetingMessage, isRecommendationRequest, isStructuredSearchRequest } from './intentMatcher';
import { detectLanguage } from './languageDetector';
import type { NLPResult } from './types';
import { extractImplicitExclusions, extractSemanticQuery } from './semanticHints';
import {
  assignFeedbackReference,
  cleanReference,
  extractFeedbackReference
} from './intentReferenceUtils';
import {
  matchClearSearchFiltersIntent,
  matchHelpIntent,
  matchNavigationIntent,
  matchViewCatalogIntent
} from './intentNavigationMatcher';
import {
  matchAddToLibraryIntent,
  matchBatchStatusActionIntent,
  matchClearUserListIntent,
  matchRatingActionIntent,
  matchRemoveFromLibraryIntent,
  matchStatusActionIntent
} from './intentLibraryActionMatcher';
import {
  matchAnimeInfoFieldIntent,
  matchGeneralAnimeInfoIntent
} from './intentAnimeInfoMatcher';
import {
  matchEpisodeOperationIntent,
  matchSynchronizationIntent
} from './intentOperationalMatcher';

export function parseIntentRegex(message: string): NLPResult {
  const msg = message.toLowerCase().trim();
  const normalizedMsg = normalizeEntityText(message);
  const result: NLPResult = {
    intent: 'UNKNOWN',
    engine: 'regex',
    language: detectLanguage(message),
    sanitized: true,
    entities: {}
  };

  const status = normalizeStatusEntity(msg);
  if (status) result.entities.status = status;
  if (normalizedMsg.match(/\b(online|internet|anilist|myanimelist|mal|kitsu)\b/)) result.entities.source = 'online';
  if (normalizedMsg.match(/\b(local|catalogo|biblioteca)\b/)) result.entities.source = 'local';
  if (normalizedMsg.match(/\b(non-japanese|not japanese|no japoneses?)\b/)) result.entities.exclude_origin = 'JP';

  const format = normalizeFormatEntity(normalizedMsg);
  if (format) result.entities.format = format;

  const durationPreference = normalizeDurationPreference(normalizedMsg);
  if (durationPreference) result.entities.durationPreference = durationPreference;

  const studio = extractStudioEntity(message);
  if (studio) result.entities.studio = studio;

  const toneTagEntities = extractToneTagEntities(msg);
  if (toneTagEntities.preferredToneTags.length > 0) result.entities.toneTags = toneTagEntities.preferredToneTags;
  if (toneTagEntities.dislikedToneTags.length > 0) result.entities.dislikedToneTags = toneTagEntities.dislikedToneTags;

  Object.assign(result.entities, extractRegionalIntensityEntities(message));
  Object.assign(result.entities, extractScoreEntities(message));
  Object.assign(result.entities, extractEpisodeLimitEntities(message));
  Object.assign(result.entities, extractDurationEntities(message));
  Object.assign(result.entities, extractRelativeYearEntities(message));
  Object.assign(result.entities, extractTagEntities(message));
  Object.assign(result.entities, extractComparisonEntities(message));
  Object.assign(result.entities, extractStaffEntities(message));
  Object.assign(result.entities, extractFranchiseExclusions(message));

  const airingStatus = extractAiringStatusEntity(message);
  if (airingStatus) result.entities.airing_status = airingStatus;

  const sortBy = extractSortEntity(message);
  if (sortBy) result.entities.sort_by = sortBy;

  const sourceMaterial = extractSourceMaterialEntity(message);
  if (sourceMaterial) result.entities.source_material = sourceMaterial;

  const demographic = extractDemographicEntity(message);
  if (demographic) result.entities.demographic = demographic;

  if (normalizedMsg.match(/\b(music videos?|videos? musicales?).*\b(specials?|especiales?)\b|\b(specials?|especiales?).*\b(music videos?|videos? musicales?)\b/)) {
    result.entities.formats = ['music', 'special'];
    delete result.entities.format;
  }

  const franchise = extractFranchiseEntity(message);
  if (franchise) result.entities.franchise = franchise;

  const seasonNumbers = extractSeasonNumbers(message);
  if (seasonNumbers) result.entities.seasons = seasonNumbers;

  const implicitExclusions = extractImplicitExclusions(message);
  if (implicitExclusions) result.entities.exclude_titles = implicitExclusions;

  const semanticQuery = extractSemanticQuery(message);
  if (semanticQuery) {
    result.entities.query = semanticQuery;
    result.entities.animeTitle = semanticQuery;
    result.entities.semantic_hint = true;
  }

  if (normalizedMsg.match(/\b(descargar|descarga|download|bajar)\b/)) {
    return { ...result, intent: 'UNSUPPORTED_DOWNLOAD' };
  }

  if (matchHelpIntent(normalizedMsg)) {
    return { ...result, intent: 'HELP' };
  }

  if (normalizedMsg.match(/\b(?:que demonios es|que es|what is)\s+(?:un\s+)?anime de recuentos de la vida\b/)) {
    result.entities.concept = 'slice_of_life';
    return { ...result, intent: 'EXPLAIN_CONCEPT' };
  }

  if (normalizedMsg.match(/\b(?:muestrame mi perfil|perfil de usuario acumulado|show my full stats|what are my top)\b/)) {
    const limitMatch = normalizedMsg.match(/\b(?:top\s+)?(three|tres|[1-9])\b/);
    if (limitMatch) result.entities.limit = ['three', 'tres'].includes(limitMatch[1]) ? 3 : Number(limitMatch[1]);
    return { ...result, intent: 'RECALL_PREFERENCE' };
  }

  if (matchClearSearchFiltersIntent(normalizedMsg)) {
    return { ...result, intent: 'CLEAR_SEARCH_FILTERS' };
  }

  if (result.entities.title_1 && result.entities.title_2) {
    return { ...result, intent: 'COMPARE_ANIME' };
  }

  if (result.entities.franchise && normalizedMsg.match(/\b(orden|cronologia|como veo|ver la saga|debo ver)\b/)) {
    return { ...result, intent: 'WATCH_ORDER' };
  }

  if (matchViewCatalogIntent(normalizedMsg)) {
    return { ...result, intent: 'VIEW_CATALOG' };
  }

  const navigationMatch = matchNavigationIntent(normalizedMsg);
  if (navigationMatch) {
    Object.assign(result.entities, navigationMatch.entities);
    return { ...result, intent: navigationMatch.intent };
  }

  const yearMatch = normalizedMsg.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch && result.entities.year_from === undefined && result.entities.year_to === undefined) {
    result.entities.year = parseInt(yearMatch[1], 10);
  }

  if (normalizedMsg.match(/\b(invierno|winter)\b/)) result.entities.season = 'winter';
  if (normalizedMsg.match(/\b(primavera|spring)\b/)) result.entities.season = 'spring';
  if (normalizedMsg.match(/\b(verano|summer)\b/)) result.entities.season = 'summer';
  if (normalizedMsg.match(/\b(otono|fall)\b/)) result.entities.season = 'fall';

  const normalizedGenre = extractGenreEntity(message);
  if (normalizedGenre) result.entities.genre = normalizedGenre;
  if (result.entities.demographic && !result.entities.genre) result.entities.genre = result.entities.demographic;

  if (result.entities.genre && result.entities.dislikedToneTags?.includes('romance_focus')) {
    const filteredGenre = removeGenreFromEntity(result.entities.genre, 'romance');
    if (filteredGenre) result.entities.genre = filteredGenre;
    else delete result.entities.genre;
  }

  if (result.entities.genre && result.entities.exclude_tags?.length) {
    let filteredGenre = result.entities.genre;
    for (const excludedTag of result.entities.exclude_tags) {
      filteredGenre = removeGenreFromEntity(filteredGenre, excludedTag) || '';
    }
    if (filteredGenre) result.entities.genre = filteredGenre;
    else delete result.entities.genre;
  }

  if (normalizedMsg.match(/\bno quiero ver nada de\b/)) {
    return { ...result, intent: 'REMEMBER_DISLIKE' };
  }

  const ratingAction = matchRatingActionIntent(normalizedMsg);
  if (ratingAction) {
    Object.assign(result.entities, ratingAction.entities);
    return { ...result, intent: ratingAction.intent };
  }

  const statusAction = matchStatusActionIntent(normalizedMsg, status);
  if (statusAction) {
    Object.assign(result.entities, statusAction.entities);
    return { ...result, intent: statusAction.intent };
  }

  if (
    result.entities.dislikedToneTags?.length
    && !result.entities.toneTags?.length
    && normalizedMsg.match(/^(?:sin|evita|evitar|no quiero|no me recomiendes|no recomiendes|no me sugieras|no sugieras)\b/)
  ) {
    return { ...result, intent: 'REMEMBER_DISLIKE' };
  }

  if (result.entities.exclude_related_to && normalizedMsg.match(/\b(no me des|recomienda|sugiere|que veo)\b/)) {
    return { ...result, intent: 'RECOMMEND_GENERAL' };
  }

  const similarRef = normalizedMsg.match(/\b(?:recomiendame(?:\s+una|\s+un)?\s+(?:serie|anime)\s+como|recomendame(?:\s+una|\s+un)?\s+(?:serie|anime)\s+como|algo como|animes parecidos a|parecidos a|similar a|similares a|something like)\s+([^,?.!]+?)(?:\s+pero\s+mejor|\s+y\s+mejor|\s+but\s+shorter|$)/i);
  if (similarRef?.[1]) {
    result.entities.refIndexOrTitle = cleanReference(similarRef[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    if (normalizedMsg.match(/\b(shorter|mas corto)\b/)) result.entities.durationPreference = 'short';
    return { ...result, intent: 'RECOMMEND_SIMILAR' };
  }

  const dislikeReference = extractFeedbackReference(msg, 'dislike');
  if (normalizedMsg.match(/\b(no me gusta|no me gustan|no me interesa|odio|odios|detesto|no aguanto|no los aguanto|no las aguanto|evita|no me recomiendes|no recomiendes|no me sugieras|no sugieras|no me vuelvas a sugerir|no me vuelvas a recomendar)\b/)) {
    if (dislikeReference && !hasStructuredPreferenceEntity(result.entities)) {
      assignFeedbackReference(result, dislikeReference);
    }
    return { ...result, intent: 'REMEMBER_DISLIKE' };
  }

  const likeReference = extractFeedbackReference(msg, 'like');
  if (likeReference && !hasStructuredPreferenceEntity(result.entities)) {
    assignFeedbackReference(result, likeReference);
    return { ...result, intent: 'REMEMBER_PREFERENCE' };
  }

  if (
    normalizedMsg.match(/\b(recuerda|graba|anota|prefiero|me gusta|me gustan|me fascina|me encanta|solo me gustan)\b/) &&
    hasStructuredPreferenceEntity(result.entities)
  ) {
    return { ...result, intent: 'REMEMBER_PREFERENCE' };
  }

  if (
    hasStructuredPreferenceEntity(result.entities)
    && !result.entities.animeTitle
    && normalizedMsg.match(/\b(recomienda|recomiendame|recomendame|sugiere|que veo|quiero|dame|pasame|algo|busco|recommend|suggest|give me|anything)\b/)
  ) {
    const semanticSearchTags = (result.entities.tags || []).filter(tag => !['highly rated', 'intense action'].includes(tag));
    if (
      (semanticSearchTags.length > 0 && normalizedMsg.match(/\b(busca|buscar|find|search)\b/))
      || (result.entities.max_episodes && normalizedMsg.match(/\b(fin de semana|maraton)\b/))
      || result.entities.airing_status
      || result.entities.format === 'donghua'
      || (result.entities.staff && normalizedMsg.match(/\b(quiero ver|produced by)\b/))
      || (result.entities.studio && normalizedMsg.match(/\bdame un anime del estudio\b/))
      || normalizedMsg.match(/\banything produced by\b/)
      || result.entities.formats?.length
    ) {
      return { ...result, intent: 'SEARCH_ANIME' };
    }
    return { ...result, intent: 'RECOMMEND_GENERAL' };
  }

  if (
    result.entities.min_score !== undefined
    && result.entities.genre
    && normalizedMsg.match(/\b(un|una)\s+(anime|romance|isekai)\b/)
    && !normalizedMsg.match(/\b(busca|buscar|find|search|list|show)\b/)
  ) {
    return { ...result, intent: 'RECOMMEND_GENERAL' };
  }

  if (normalizedMsg.match(/capitulos?.*pendientes|pendientes.*capitulos?/)) {
    return { ...result, intent: 'FILTER_EPISODES_PENDING' };
  }

  if (
    normalizedMsg.match(/\b(pendientes|viendo|en progreso)\b/)
    && normalizedMsg.match(/\b(mis|ver|mostrar|lista|tengo|quiero ver)\b/)
    && !normalizedMsg.match(/^(?:agrega|anade|add)\b/)
  ) {
    return { ...result, intent: 'SEARCH_PENDING' };
  }

  if (normalizedMsg.match(/\bshow my current watching list\b/)) {
    result.entities.status = 'watching';
    result.entities.source = 'local';
    return { ...result, intent: 'VIEW_CATALOG' };
  }

  if (
    normalizedMsg.match(/\b(completados|terminados|finalizados)\b/)
    && normalizedMsg.match(/\b(mis|ver|mostrar|lista|tengo|quiero ver)\b/)
    && !normalizedMsg.match(/^(?:agrega|anade|add)\b/)
  ) {
    return { ...result, intent: 'SEARCH_COMPLETED' };
  }

  if (normalizedMsg.match(/cuales.*(he\s+)?completad|que.*(he\s+)?completad/)) {
    return { ...result, intent: 'SEARCH_COMPLETED' };
  }

  const adaptationQuery = normalizedMsg.match(/\bfind\s+(?:the\s+)?anime adaptation of\s+(.+)$/);
  if (adaptationQuery?.[1]) {
    result.entities.query = cleanReference(adaptationQuery[1]);
    result.entities.animeTitle = result.entities.query;
  }

  const styleReference = normalizedMsg.match(/\bfind\s+.+?\s+matching\s+(.+?)\s+style$/);
  if (styleReference?.[1]) {
    result.entities.refIndexOrTitle = cleanReference(styleReference[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    return { ...result, intent: 'RECOMMEND_SIMILAR' };
  }

  const titleMatch = normalizedMsg.match(/(?:busca|buscar|sobre|anime|serie|encuentra|quiero ver|search for|search|find)(?:\s+llamado|\s+el|\s+la)?\s+([a-z0-9\s:!_-]{2,50})/);
  if (titleMatch) {
    const rawTitle = titleMatch[1].trim();
    const genreSearchOnly = rawTitle.match(/^(?:un|una)?\s*(?:anime|animes|serie|series)\s+de\s+/i);
    const stopWords = ['y', 'que', 'en', 'por', 'online', 'internet', 'anilist', 'myanimelist', 'mal', 'kitsu', 'ano', 'anio', 'genero', 'temporada', 'estudio', 'parecido', 'similar', 'capitulos', 'episodios', 'como', 'con', 'del', 'para'];
    const parts = rawTitle.split(' ');
    let finalTitle = '';
    for (const p of parts) {
      if (stopWords.includes(normalizeEntityText(p)) && finalTitle.length > 0) break;
      finalTitle += (finalTitle ? ' ' : '') + p;
    }
    const vagueTerms = ['algo', 'cosas', 'anime', 'animes', 'serie', 'series', 'capitulos', 'episodios'];
    if (!genreSearchOnly && !hasStructuredPreferenceEntity(result.entities) && finalTitle.length > 2 && !vagueTerms.includes(normalizeEntityText(finalTitle))) {
      result.entities.animeTitle = finalTitle;
      result.entities.query = finalTitle;
    }
  }

  const generalInfoIntent = matchGeneralAnimeInfoIntent(normalizedMsg);
  if (generalInfoIntent) {
    Object.assign(result.entities, generalInfoIntent.entities);
    return { ...result, intent: generalInfoIntent.intent };
  }

  const addAction = matchAddToLibraryIntent(normalizedMsg);
  if (addAction) {
    Object.assign(result.entities, addAction.entities);
    return { ...result, intent: addAction.intent };
  }

  const clearUserListAction = matchClearUserListIntent(normalizedMsg);
  if (clearUserListAction) {
    return { ...result, intent: clearUserListAction.intent };
  }

  const removeAction = matchRemoveFromLibraryIntent(normalizedMsg, status);
  if (removeAction) {
    Object.assign(result.entities, removeAction.entities);
    return { ...result, intent: removeAction.intent };
  }

  const batchStatusAction = matchBatchStatusActionIntent(normalizedMsg, result.entities.seasons);
  if (batchStatusAction) {
    Object.assign(result.entities, batchStatusAction.entities);
    return { ...result, intent: batchStatusAction.intent };
  }

  const fieldInfoIntent = matchAnimeInfoFieldIntent(normalizedMsg);
  if (fieldInfoIntent) {
    Object.assign(result.entities, fieldInfoIntent.entities);
    return { ...result, intent: fieldInfoIntent.intent };
  }

  if (isStructuredSearchRequest(msg, normalizedMsg, result.entities)) {
    return { ...result, intent: 'SEARCH_ANIME' };
  }

  const synchronizationIntent = matchSynchronizationIntent(normalizedMsg);
  if (synchronizationIntent) return { ...result, intent: synchronizationIntent };

  if (normalizedMsg.match(/analiza mi biblioteca|cuantos animes tengo guardados|cuantos animes he completado|cuantos.*pendientes|generos favoritos|estudios veo|anos.*mas|temporada.*mas|anime.*mas avanzado/)) return { ...result, intent: 'LIBRARY_STATS' };

  if (normalizedMsg.match(/compara|cual deberia ver|mas parecido a mis gustos/)) return { ...result, intent: 'COMPARE_ANIME' };

  if (normalizedMsg.match(/\b(siguiente recomendacion|another suggestion|different from that one)\b/)) {
    result.entities.context_continuation = true;
    result.entities.exclude_last_shown = true;
    return { ...result, intent: 'RECOMMEND_GENERAL' };
  }

  if (isRecommendationRequest(msg, normalizedMsg)) {
    if (normalizedMsg.includes('parecido') || normalizedMsg.includes('similar')) return { ...result, intent: 'RECOMMEND_SIMILAR' };
    return { ...result, intent: 'RECOMMEND_GENERAL' };
  }

  const episodeOperationIntent = matchEpisodeOperationIntent(normalizedMsg);
  if (episodeOperationIntent) return { ...result, intent: episodeOperationIntent };

  if (normalizedMsg.match(/anade.*biblioteca/)) return { ...result, intent: 'ADD_TO_LIBRARY' };
  if (normalizedMsg.match(/elimina.*biblioteca/)) return { ...result, intent: 'REMOVE_FROM_LIBRARY' };
  if (normalizedMsg.match(/edita.*informacion|actualiza los datos/)) return { ...result, intent: 'EDIT_ANIME' };
  if (normalizedMsg.match(/marca.*(como\s)?viendo/)) return { ...result, intent: 'UPDATE_STATUS' };
  if (normalizedMsg.match(/marca.*(como\s)?completado/)) return { ...result, intent: 'UPDATE_STATUS' };
  if (normalizedMsg.match(/marca.*(como\s)?pendiente/)) return { ...result, intent: 'UPDATE_STATUS' };
  if (normalizedMsg.match(/marca.*(como\s)?abandonado/)) return { ...result, intent: 'UPDATE_STATUS' };
  if (normalizedMsg.match(/anade.*favorito/)) return { ...result, intent: 'ADD_FAVORITE' };
  if (normalizedMsg.match(/quita.*favorito/)) return { ...result, intent: 'REMOVE_FAVORITE' };
  if (normalizedMsg.match(/duplicado/)) return { ...result, intent: 'FIND_DUPLICATES' };
  if (normalizedMsg.match(/ordena mi biblioteca/)) return { ...result, intent: 'SORT_LIBRARY' };

  if (normalizedMsg.match(/de que trata|resume|sinopsis/)) return { ...result, intent: 'EXPLAIN_SYNOPSIS' };
  if (normalizedMsg.match(/esta finalizado/)) return { ...result, intent: 'IS_FINISHED' };
  if (normalizedMsg.match(/cuantos capitulos tiene/)) return { ...result, intent: 'HOW_MANY_EPISODES' };
  if (normalizedMsg.match(/en que orden/)) return { ...result, intent: 'WATCH_ORDER' };
  if (normalizedMsg.match(/que temporadas tiene/)) return { ...result, intent: 'LIST_SEASONS' };
  if (normalizedMsg.match(/tiene peliculas u ovas/)) return { ...result, intent: 'HAS_MOVIES_OVAS' };

  if (normalizedMsg.match(/busca|encuentra|muestra|muestrame|search/)) {
    if (normalizedMsg.includes('parecido') || normalizedMsg.includes('similar')) return { ...result, intent: 'SEARCH_SIMILAR' };
    if (normalizedMsg.includes('capitulos disponibles')) return { ...result, intent: 'SEARCH_AVAILABLE_EPISODES' };
    if (normalizedMsg.includes('populares')) return { ...result, intent: 'SEARCH_POPULAR' };
    if (normalizedMsg.includes('finalizados')) return { ...result, intent: 'SEARCH_COMPLETED' };
    if (normalizedMsg.includes('pendientes')) return { ...result, intent: 'SEARCH_PENDING' };
    if (!result.entities.query && result.entities.animeTitle) result.entities.query = result.entities.animeTitle;
    return { ...result, intent: 'SEARCH_ANIME' };
  }

  if (normalizedMsg.match(/recuerda|graba|me gusta.*genero|anota/)) return { ...result, intent: 'REMEMBER_PREFERENCE' };
  if (normalizedMsg.match(/que (generos |)me gusta|cual es mi genero favorito|que recuerdas/)) return { ...result, intent: 'RECALL_PREFERENCE' };

  if (isGreetingMessage(msg, normalizedMsg)) return { ...result, intent: 'GREETING' };
  if (normalizedMsg.match(/gracias|te lo agradezco/)) return { ...result, intent: 'THANKS' };

  return result;
}
