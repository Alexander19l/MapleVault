import { query } from '../database/db';
import { decorateAnimeListWithSpanishTranslation } from '../translation/translationService';
import { decorateResult, mergeAnimeResults } from './animeResultUtils';
import type { ChatResponse } from './chatResponse';
import { startRemoteAnimeSearch } from './remoteSearchPagination';
import { startPagedAnimeResults } from './resultPagination';
import { buildAnimeSearchPlan } from './searchQueryPlanner';
import type { NLPResult } from './types';

export async function handleSearchAnime(entities: NLPResult['entities']): Promise<ChatResponse> {
  const searchPlan = buildAnimeSearchPlan(entities);
  const { queryText, onlineQueryText, hasSearchCriteria } = searchPlan;
  const localResults: any[] = [];
  const wantsOnlineOnly = entities.source === 'online';
  const wantsLocalOnly = entities.source === 'local';

  if (!hasSearchCriteria) {
    return {
      text: 'Necesito un criterio más concreto para buscar. Puedes pedirme un título, género, estudio, temporada, año o puntuación mínima.'
    };
  }

  if (!wantsOnlineOnly && searchPlan.sql) {
    localResults.push(...(await query.all(searchPlan.sql, searchPlan.params)).map(row => decorateResult(row, 'local')));
  }

  const shouldSearchOnline = !wantsLocalOnly && (wantsOnlineOnly || localResults.length === 0);
  if (shouldSearchOnline && onlineQueryText) {
    return startRemoteAnimeSearch(
      onlineQueryText,
      `Resultados para "${queryText || onlineQueryText}"`
    );
  }

  const mergedResults = mergeAnimeResults(localResults, []).slice(0, 32);
  const results = await decorateAnimeListWithSpanishTranslation(mergedResults, { maxRowsToTranslate: 12 });

  if (results.length > 0) {
    const resultLabel = results.length === 1 ? 'resultado' : 'resultados';
    return startPagedAnimeResults({
      mode: 'search',
      label: `Resultados para "${queryText || onlineQueryText || 'tu consulta'}"`,
      items: results,
      text: `Encontré ${results.length} ${resultLabel} para "${queryText || onlineQueryText || 'tu consulta'}" en tu biblioteca local. Puedes abrir una ficha con "info el 1".`
    });
  }

  if (entities.season && entities.year) {
    return { text: `No encontré resultados verificados para la temporada ${entities.season} ${entities.year}.` };
  }

  return { text: 'No encontré esa serie en fuentes verificadas. Prueba con otro título o una búsqueda online más específica.' };
}
