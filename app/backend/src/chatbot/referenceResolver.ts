import { query } from '../database/db';
import { splitGenres } from '../recommendations/scoring';
import { decorateAnimeWithSpanishTranslation } from '../translation/translationService';
import { getLastSearchContext } from './memory';
import { decorateResult, normalizeTitleKey } from './animeResultUtils';
import { searchOnlineSources } from './onlineAnimeSearch';

export async function resolveReferenceOrTitle(ref: string | undefined): Promise<any | null> {
  const normalizedRef = String(ref || '').trim();
  if (!normalizedRef) return null;

  const firstResultMatch = normalizedRef.match(/^(?:el\s+|la\s+)?(?:primero|primera)$/i);
  if (firstResultMatch) {
    const lastResults = await getLastSearchContext();
    return lastResults[0] ? decorateAnimeWithSpanishTranslation(lastResults[0]) : null;
  }

  const contextReferenceMatch = normalizedRef.match(/^(?:esto|eso|este|esta|ese|esa|anterior|lo anterior)$/i);
  if (contextReferenceMatch) {
    const lastResults = await getLastSearchContext();
    return lastResults.length === 1 ? decorateAnimeWithSpanishTranslation(lastResults[0]) : null;
  }

  const numericMatch = normalizedRef.match(/^(?:el\s+)?(\d+)$/i);
  if (numericMatch) {
    const index = Number(numericMatch[1]) - 1;
    const lastResults = await getLastSearchContext();
    return lastResults[index] ? decorateAnimeWithSpanishTranslation(lastResults[index]) : null;
  }

  const local = await query.get(`
    SELECT a.*, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    WHERE LOWER(a.title) LIKE ?
       OR LOWER(a.title_romaji) LIKE ?
       OR LOWER(a.title_english) LIKE ?
    ORDER BY
      CASE WHEN LOWER(a.title) = ? THEN 0 ELSE 1 END,
      a.popularity DESC,
      a.score DESC
    LIMIT 1
  `, [`%${normalizedRef.toLowerCase()}%`, `%${normalizedRef.toLowerCase()}%`, `%${normalizedRef.toLowerCase()}%`, normalizedRef.toLowerCase()]);

  if (local) return decorateAnimeWithSpanishTranslation(decorateResult(local, 'local'));

  const lastResults = await getLastSearchContext();
  const remembered = lastResults.find(item => normalizeTitleKey(item.title).includes(normalizeTitleKey(normalizedRef))) || null;
  return remembered ? decorateAnimeWithSpanishTranslation(remembered) : null;
}

export async function resolveReferenceOrTitleOrOnline(ref: string | undefined): Promise<any | null> {
  const localOrContext = await resolveReferenceOrTitle(ref);
  if (localOrContext) return localOrContext;

  const normalizedRef = String(ref || '').trim();
  if (!normalizedRef) return null;

  const onlineResults = await searchOnlineSources(normalizedRef);
  return onlineResults[0] || null;
}

export async function getAnimeGenreNames(anime: any): Promise<string[]> {
  if (Array.isArray(anime?.genres)) return splitGenres(anime.genres.join(','));
  if (anime?.genres_joined) return splitGenres(anime.genres_joined);
  if (typeof anime?.genres === 'string') return splitGenres(anime.genres);

  if (!anime?.id || anime?.result_origin === 'online') return [];

  const rows = await query.all(`
    SELECT g.name
    FROM anime_genres ag
    JOIN genres g ON ag.genre_id = g.id
    WHERE ag.anime_id = ?
  `, [anime.id]);

  return splitGenres(rows.map(row => row.name).join(','));
}
