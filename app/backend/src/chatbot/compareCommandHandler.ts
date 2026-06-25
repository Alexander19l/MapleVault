import { query } from '../database/db';
import {
  decorateAnimeListWithSpanishTranslation,
  getDisplayGenres,
  translateStatusLabel
} from '../translation/translationService';
import { decorateResult, fieldOrUnavailable, formatEpisodeCount } from './animeResultUtils';
import type { ChatResponse } from './chatResponse';
import { setLastSearchContext } from './memory';
import { searchOnlineSources } from './onlineAnimeSearch';
import { resolveReferenceOrTitleOrOnline } from './referenceResolver';
import type { NLPResult } from './types';

export async function handleCompareAnime(entities: NLPResult['entities']): Promise<ChatResponse> {
  const first = await resolveReferenceOrTitleOrOnline(entities.title_1);
  const second = await resolveReferenceOrTitleOrOnline(entities.title_2);

  if (!first || !second) {
    const missing = !first ? entities.title_1 : entities.title_2;
    return { text: `No pude resolver "${missing}". Para comparar necesito dos series verificables por título local o fuente online.` };
  }

  const decorated = await decorateAnimeListWithSpanishTranslation([first, second], { maxRowsToTranslate: 2 });
  await setLastSearchContext(decorated);
  const [a, b] = decorated;
  const lines = [
    `Comparacion entre **${a.title}** y **${b.title}**:`,
    `- Puntaje: ${fieldOrUnavailable(a.score)} vs ${fieldOrUnavailable(b.score)}.`,
    `- Episodios: ${formatEpisodeCount(a)} vs ${formatEpisodeCount(b)}.`,
    `- Estado: ${fieldOrUnavailable(a.status_label_es || translateStatusLabel(a.status) || a.status)} vs ${fieldOrUnavailable(b.status_label_es || translateStatusLabel(b.status) || b.status)}.`,
    `- Generos: ${fieldOrUnavailable(getDisplayGenres(a))} vs ${fieldOrUnavailable(getDisplayGenres(b))}.`,
    `- Sinopsis: ${fieldOrUnavailable(a.synopsis_es || a.synopsis).slice(0, 180)} / ${fieldOrUnavailable(b.synopsis_es || b.synopsis).slice(0, 180)}`
  ];

  return {
    text: lines.join('\n'),
    visualData: { type: 'anime_list', data: decorated }
  };
}

export async function handleWatchOrder(entities: NLPResult['entities']): Promise<ChatResponse> {
  const franchise = String(entities.franchise || entities.query || '').trim();
  if (!franchise) return { text: 'Dime la saga o franquicia para buscar un orden de visualizacion.' };

  let rows = await query.all(`
    SELECT a.*
    FROM anime a
    WHERE LOWER(a.title) LIKE ?
       OR LOWER(a.title_romaji) LIKE ?
       OR LOWER(a.title_english) LIKE ?
    ORDER BY COALESCE(a.year, 9999) ASC, COALESCE(a.start_date, '') ASC, a.id ASC
    LIMIT 12
  `, [`%${franchise.toLowerCase()}%`, `%${franchise.toLowerCase()}%`, `%${franchise.toLowerCase()}%`]);

  rows = rows.map(row => decorateResult(row, 'local'));
  if (rows.length === 0) {
    rows = (await searchOnlineSources(franchise)).slice(0, 8);
  }

  if (rows.length === 0) {
    return { text: `No encontré datos suficientes para ordenar la saga "${franchise}".` };
  }

  const ordered = await decorateAnimeListWithSpanishTranslation(rows, { maxRowsToTranslate: 8 });
  await setLastSearchContext(ordered);
  const list = ordered
    .map((anime: any, index: number) => `${index + 1}. ${anime.title} (${fieldOrUnavailable(anime.year || anime.start_date)})`)
    .join('\n');

  return {
    text: `Orden sugerido por fecha de emision disponible para "${franchise}":\n${list}`,
    visualData: { type: 'anime_list', data: ordered }
  };
}
