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

function extractReferenceOrTitle(message: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const value = match?.[1] || match?.[2] || match?.[3];
    if (value) return value.trim();
  }
  return undefined;
}

function cleanReference(value: string): string {
  return value
    .replace(/\s+--(?:force|yes|confirm)\b.*$/i, '')
    .replace(/^(?:el|la|los|las|del|de la|de los|de las)\s+/i, '')
    .replace(/\s+(?:from|de)\s+(?:my\s+)?(?:watching|completed|dropped|plan to watch)\s+list$/i, '')
    .replace(/\s+(?:to|a)\s+(?:my\s+)?(?:watchlist|watching list|completed list|dropped list)$/i, '')
    .replace(/\s+(a|como)\s+(pendiente|pendientes|viendo|completado|completada|abandonado|abandonada|pausado|pausada)$/i, '')
    .replace(/\s+a\s+mi\s+lista(?:\s+de\s+\w+)?$/i, '')
    .trim();
}

function cleanFeedbackReference(value: string): string {
  return value
    .replace(/^[\s"'`]+|[\s"'`.,!?]+$/g, '')
    .replace(/^(?:el|la|los|las)\s+(?:anime|serie)\s+/i, '')
    .replace(/^(?:anime|serie)\s+/i, '')
    .trim();
}

function extractFeedbackReference(message: string, mode: 'like' | 'dislike'): string | undefined {
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

function assignFeedbackReference(result: NLPResult, reference: string): void {
  result.entities.refIndexOrTitle = reference;
  result.entities.animeTitle = reference;
}

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

  if (
    normalizedMsg.match(/^\/?(ayuda|help|comandos|commands|opciones|capacidades)$/)
    || normalizedMsg.match(/^(muestrame|mostrar|ver)\s+(la\s+)?(ayuda|lista de comandos|capacidades)$/)
    || normalizedMsg.match(/^que\s+(puedes|sabes)\s+hacer/)
    || normalizedMsg.match(/^como\s+(te\s+)?(uso|utilizo)/)
    || normalizedMsg.match(/\b(what can you do|show help|what tools or features do you have)\b/)
  ) {
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

  if (normalizedMsg.match(/\b(?:quita todos los filtros|clear all search filters)\b/)) {
    return { ...result, intent: 'CLEAR_SEARCH_FILTERS' };
  }

  if (result.entities.title_1 && result.entities.title_2) {
    return { ...result, intent: 'COMPARE_ANIME' };
  }

  if (result.entities.franchise && normalizedMsg.match(/\b(orden|cronologia|como veo|ver la saga|debo ver)\b/)) {
    return { ...result, intent: 'WATCH_ORDER' };
  }

  if (
    normalizedMsg.match(/^(mi\s+)?catalogo$/)
    || normalizedMsg.match(/^(muestrame|mostrar|ver)\s+(mi\s+|el\s+)?catalogo$/)
    || normalizedMsg.match(/^mi\s+lista$/)
    || normalizedMsg.match(/^que\s+tengo/)
  ) {
    return { ...result, intent: 'VIEW_CATALOG' };
  }

  if (
    normalizedMsg.match(/^pagina\s+anterior$/)
    || normalizedMsg.match(/^(?:volver|regresar|ir)\s+(?:a\s+)?(?:la\s+)?pagina\s+anterior$/)
    || normalizedMsg.match(/^(?:previous|back)\s+page$/)
  ) {
    result.entities.context_continuation = true;
    return { ...result, intent: 'PREVIOUS_ACTIVE_PAGE' };
  }

  const directPageMatch = normalizedMsg.match(
    /^(?:(?:ir|ve|mostrar|muestrame|mostrame|abre|cargar)\s+(?:a\s+)?(?:la\s+)?pagina|pagina|go\s+to\s+page|show\s+page)\s+([1-9]\d{0,2})$/
  );
  if (directPageMatch) {
    result.entities.page = Number(directPageMatch[1]);
    result.entities.context_continuation = true;
    return { ...result, intent: 'NAVIGATE_ACTIVE_PAGE' };
  }

  if (
    normalizedMsg.match(/^(?:ver|mostrar|muestrame|mostrame|dame|cargar)\s+mas\s+(?:resultados|opciones|recomendaciones|pendientes|completados|completadas)$/)
    || normalizedMsg.match(/^(?:siguiente|proxima)\s+pagina\s+(?:de\s+)?(?:resultados|recomendaciones|pendientes|completados)$/)
    || normalizedMsg.match(/^(?:show|load)\s+more\s+(?:results|recommendations|pending|completed)$/)
  ) {
    result.entities.context_continuation = true;
    return { ...result, intent: 'CONTINUE_RESULTS' };
  }

  if (
    normalizedMsg.match(/^(?:ver|mostrar|muestrame|mostrame|dame|cargar)\s+mas\s+(?:series|animes)\s+de\s+mi\s+catalogo$/)
    || normalizedMsg.match(/^(?:siguiente|proxima)\s+pagina\s+del\s+catalogo$/)
    || normalizedMsg.match(/^continua(?:r)?\s+(?:con\s+)?(?:mi\s+)?catalogo$/)
    || normalizedMsg.match(/^(?:show|load)\s+more\s+(?:anime|series)\s+from\s+my\s+catalog$/)
  ) {
    result.entities.context_continuation = true;
    return { ...result, intent: 'CONTINUE_CATALOG' };
  }

  if (
    normalizedMsg.match(/^(?:ver|mostrar|muestrame|mostrame|dame|cargar)\s+mas\s+(?:series|animes)$/)
    || normalizedMsg.match(/^(?:siguiente|proxima)\s+pagina$/)
    || normalizedMsg.match(/^(?:show|load)\s+more\s+(?:anime|series)$/)
  ) {
    result.entities.context_continuation = true;
    return { ...result, intent: 'CONTINUE_ACTIVE' };
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

  const absoluteTenMatch = normalizedMsg.match(/\bponle\s+un\s+diez\s+absoluto\s+a\s+(.+)$/);
  const numericRatingMatch = normalizedMsg.match(/\b(?:ponle|le doy|le pongo|califica|rate)\s+(?:un\s+)?(?:nota\s+)?(\d+(?:\.\d+)?)\s*(?:de\s+10|\/10|de\s+nota)?\s+(?:a\s+)?(.+)$/);
  if (absoluteTenMatch?.[1] || numericRatingMatch?.[2]) {
    const score = absoluteTenMatch ? 10 : Number(numericRatingMatch?.[1]);
    const title = absoluteTenMatch?.[1] || numericRatingMatch?.[2];
    if (Number.isFinite(score) && score >= 0 && score <= 10 && title) {
      result.entities.score = score;
      result.entities.refIndexOrTitle = cleanReference(title);
      result.entities.animeTitle = result.entities.refIndexOrTitle;
      return { ...result, intent: 'RATE_ANIME' };
    }
  }

  const updateStatusMatch = normalizedMsg.match(/\b(?:marcar|marca|cambiar estado de|change status of)\s+(.+?)\s+(?:como|a|to)\s+(viendo|en progreso|pendiente|completado|completada|abandonado|abandonada|pausado|pausada|watching|completed|dropped|on hold)\b/);
  if (updateStatusMatch?.[1] && status) {
    result.entities.refIndexOrTitle = cleanReference(updateStatusMatch[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    return { ...result, intent: 'UPDATE_STATUS' };
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

  const infoRef = extractReferenceOrTitle(normalizedMsg, [
    /^info\s+(.+)/,
    /^(?:dame|dime|muestra|mostrar|pasame)\s+(?:info|informacion|detalles?)\s+(?:de|del|sobre)\s+(.+)/,
    /^(?:info|informacion|detalles?)\s+(?:de|del|sobre)\s+(.+)/,
    /^(?:que sabes de|detalles de)\s+(.+)/,
    /^ver\s+info\s+(.+)/,
    /^show\s+(?:me\s+)?(?:info|information|details)\s+(?:about|of)\s+(.+)/
  ]);
  if (infoRef) {
    result.entities.refIndexOrTitle = cleanReference(infoRef);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    return { ...result, intent: 'SHOW_ANIME_INFO' };
  }

  const addRef = extractReferenceOrTitle(normalizedMsg, [
    /^agrega(?:r)?\s+(?:el\s+)?(.+)/,
    /^anade\s+(?:el\s+)?(.+)/,
    /^importa\s+(?:el\s+)?(.+)/,
    /^add\s+(.+)/
  ]);
  if (addRef && !normalizedMsg.match(/\bbusqueda anterior\b/)) {
    result.entities.refIndexOrTitle = cleanReference(addRef);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    return { ...result, intent: 'ADD_TO_LIBRARY' };
  }

  if (normalizedMsg.match(/^borra mi watchlist(?:\s+--(?:force|yes|confirm))*$/)) {
    return { ...result, intent: 'CLEAR_USER_LIST' };
  }

  const removeRef = extractReferenceOrTitle(normalizedMsg, [
    /^elimina(?:r)?\s+(?:el\s+)?(.+)/,
    /^borra(?:r)?\s+(?:el\s+)?(.+)/,
    /^quita(?:r)?\s+(?:el\s+)?(.+)/,
    /^remove\s+(.+)/
  ]);
  if (removeRef && !normalizedMsg.match(/\b(busqueda|filtro|historial)\b/)) {
    result.entities.refIndexOrTitle = cleanReference(removeRef);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    if (normalizedMsg.match(/\bfrom\s+(?:my\s+)?(?:watching|completed|dropped|plan to watch)(?:\s+list)?\b/)) {
      result.entities.list = status || normalizedMsg.match(/\b(watching|completed|dropped|plan to watch)\b/)?.[1];
      return { ...result, intent: 'REMOVE_FROM_LIST' };
    }
    return { ...result, intent: 'REMOVE_FROM_LIBRARY' };
  }

  const batchMatch = normalizedMsg.match(/\bmarca\s+(?:toda\s+)?(?:la\s+)?temporada(?:s)?\s+[0-9y,\s]+\s+de\s+(.+?)\s+como\s+vistas?\b/);
  if (batchMatch?.[1] && result.entities.seasons?.length) {
    result.entities.refIndexOrTitle = cleanReference(batchMatch[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    result.entities.status = 'completed';
    return { ...result, intent: 'BATCH_UPDATE_STATUS' };
  }

  const episodeFieldRef = normalizedMsg.match(/\bcuantos\s+(?:episodios|capitulos)\s+tiene\s+(.+)$/);
  if (episodeFieldRef?.[1]) {
    result.entities.refIndexOrTitle = cleanReference(episodeFieldRef[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    result.entities.field = 'episodes';
    return { ...result, intent: 'SHOW_ANIME_INFO' };
  }

  const startDateFieldRef = normalizedMsg.match(/\bcuando\s+(?:empezo|inicio|salio)\s+(.+)$/);
  if (startDateFieldRef?.[1]) {
    result.entities.refIndexOrTitle = cleanReference(startDateFieldRef[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    result.entities.field = 'start_date';
    return { ...result, intent: 'SHOW_ANIME_INFO' };
  }

  const synopsisFieldRef = normalizedMsg.match(/\b(?:de que trata|sinopsis de|resume)\s+(.+)$/);
  if (synopsisFieldRef?.[1]) {
    result.entities.refIndexOrTitle = cleanReference(synopsisFieldRef[1]);
    result.entities.animeTitle = result.entities.refIndexOrTitle;
    result.entities.field = 'synopsis';
    return { ...result, intent: 'SHOW_ANIME_INFO' };
  }

  const genericFieldPatterns: Array<{ pattern: RegExp; field: NLPResult['entities']['field'] }> = [
    { pattern: /\b(?:cual es la nota|mean score of|puntaje de)\s+(.+)$/, field: 'score' },
    { pattern: /\b(?:que estudio.*hizo|estudio de animacion que hizo|what studio animated)\s+(.+)$/, field: 'studio' },
    { pattern: /\b(?:ano de lanzamiento de|cuando se estreno)\s+(.+)$/, field: 'start_date' },
    { pattern: /\b(?:cuando se estrena la proxima parte de|when does the next episode of)\s+(.+)$/, field: 'next_episode_date' },
    { pattern: /\b(?:cuando.*proxima temporada de|when does the next season of)\s+(.+?)(?:\s+air)?$/, field: 'next_season_date' }
  ];
  for (const fieldPattern of genericFieldPatterns) {
    const match = normalizedMsg.match(fieldPattern.pattern);
    if (match?.[1]) {
      result.entities.refIndexOrTitle = cleanReference(match[1]);
      result.entities.animeTitle = result.entities.refIndexOrTitle;
      result.entities.field = fieldPattern.field;
      return { ...result, intent: 'SHOW_ANIME_INFO' };
    }
  }

  if (isStructuredSearchRequest(msg, normalizedMsg, result.entities)) {
    return { ...result, intent: 'SEARCH_ANIME' };
  }

  if (normalizedMsg.match(/sincroniza|actualiza( mis)? listas|sincronizacion|reintenta.*sincroniz/)) return { ...result, intent: 'SYNC_LIBRARY' };
  if (normalizedMsg.match(/actualiza.*metadatos/)) return { ...result, intent: 'SYNC_METADATA' };
  if (normalizedMsg.match(/actualiza.*capitulos|busca.*capitulos nuevos|verifica.*capitulos/)) return { ...result, intent: 'SYNC_EPISODES' };
  if (normalizedMsg.match(/cancela.*sincronizac/)) return { ...result, intent: 'CANCEL_SYNC' };
  if (normalizedMsg.match(/resumen.*sincronizac/)) return { ...result, intent: 'SYNC_SUMMARY' };

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

  if (normalizedMsg.match(/muestrame.*capitulos/)) return { ...result, intent: 'SHOW_EPISODES' };
  if (normalizedMsg.match(/marca.*visto/)) {
    if (normalizedMsg.includes('todos') || normalizedMsg.includes('anteriores')) return { ...result, intent: 'MARK_ALL_WATCHED' };
    return { ...result, intent: 'MARK_EPISODE_WATCHED' };
  }
  if (normalizedMsg.match(/ultimos?\s+capitulos?\s+vistos?/)) return { ...result, intent: 'FILTER_EPISODES_WATCHED' };
  if (normalizedMsg.match(/ultimo capitulo visto/)) return { ...result, intent: 'LAST_WATCHED_EPISODE' };
  if (normalizedMsg.match(/siguiente.*pendiente/)) return { ...result, intent: 'NEXT_PENDING_EPISODE' };
  if (normalizedMsg.match(/ordena.*menor a mayor/)) return { ...result, intent: 'SORT_EPISODES_ASC' };
  if (normalizedMsg.match(/ordena.*mayor a menor/)) return { ...result, intent: 'SORT_EPISODES_DESC' };
  if (normalizedMsg.match(/filtra.*vistos/)) return { ...result, intent: 'FILTER_EPISODES_WATCHED' };
  if (normalizedMsg.match(/filtra.*pendientes|que capitulos.*pendientes/)) return { ...result, intent: 'FILTER_EPISODES_PENDING' };
  if (normalizedMsg.match(/que\s+capitulos?\s+me\s+faltan/)) return { ...result, intent: 'FILTER_EPISODES_PENDING' };
  if (normalizedMsg.match(/abre.*capitulo/)) return { ...result, intent: 'OPEN_EPISODE' };

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
