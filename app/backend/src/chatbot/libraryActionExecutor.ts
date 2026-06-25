import { query } from '../database/db';
import { saveNormalizedAnimeToLocal as persistNormalizedAnimeToLocal } from '../scraping/scraper';
import { sanitizeExternalAnime } from '../security/sanitize';
import { logBotAction } from './actionAudit';
import type { ActionComplete } from './actionExecutionTypes';
import type {
  AddAnimeActionPayload,
  AnimeIdActionPayload,
  ResolveDuplicatesActionPayload
} from './actionPayloads';

export async function executeAddAnimeAction(actionData: AddAnimeActionPayload, complete: ActionComplete): Promise<string> {
  if (!actionData.title || typeof actionData.title !== 'string') {
    return complete('REJECTED', 'No se pudo importar el anime: datos incompletos.', actionData);
  }

  const animeData = {
    external_id: actionData.external_id || null,
    source: actionData.source || 'Chatbot',
    title: String(actionData.title).slice(0, 500),
    title_romaji: String(actionData.title_romaji || actionData.title).slice(0, 500),
    title_english: String(actionData.title_english || actionData.title).slice(0, 500),
    title_japanese: String(actionData.title_japanese || '').slice(0, 500),
    synopsis: String(actionData.synopsis_original || actionData.synopsis || 'Importado a través del asistente Maple.').slice(0, 5000),
    year: Number(actionData.year) || new Date().getFullYear(),
    season: ['winter', 'spring', 'summer', 'fall'].includes(String(actionData.season)) ? actionData.season : 'unknown',
    status: String(actionData.status || 'unknown').slice(0, 50),
    type: String(actionData.type || 'tv').slice(0, 50),
    episodes: Math.min(Number(actionData.episodes) || 12, 10000),
    duration: Math.min(Number(actionData.duration) || 24, 300),
    score: Math.min(Math.max(Number(actionData.score) || 0, 0), 10),
    popularity: Number(actionData.popularity) || 1000,
    cover_image: String(actionData.cover_image || '').slice(0, 1000),
    banner_image: String(actionData.banner_image || '').slice(0, 1000),
    studio: String(actionData.studio || 'Desconocido').slice(0, 200),
    source_material: String(actionData.source_material || 'manga').slice(0, 100),
    genres: Array.isArray(actionData.genres) ? actionData.genres.slice(0, 20).map((genre: any) => String(genre).slice(0, 100)) : ['Action']
  };

  const localId = await persistNormalizedAnimeToLocal(sanitizeExternalAnime(animeData) as any);
  const requestedWatchStatus = ['watching', 'plan_to_watch', 'completed', 'dropped'].includes(String(actionData.watch_status))
    ? String(actionData.watch_status)
    : 'plan_to_watch';

  await query.run(`
    INSERT OR IGNORE INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched)
    VALUES (?, ?, 0, 0, 0)
  `, [localId, requestedWatchStatus]);

  await logBotAction('add_anime', { title: animeData.title }, 'SUCCESS');
  return complete('SUCCESS', `Listo. **${animeData.title}** fue agregado a tu biblioteca como "${requestedWatchStatus}".`, { title: animeData.title, watch_status: requestedWatchStatus });
}

export async function executeResolveDuplicatesAction(actionData: ResolveDuplicatesActionPayload, complete: ActionComplete): Promise<string> {
  const title = String(actionData.title || '').slice(0, 500);
  if (!title) return complete('REJECTED', 'No se especificó el título para resolver duplicados.', actionData);

  const rows = await query.all('SELECT id FROM anime WHERE title = ? ORDER BY id ASC', [title]);
  if (rows.length > 1) {
    const idsToDelete = rows.slice(1).map((row: any) => row.id);
    for (const id of idsToDelete) {
      await query.run('DELETE FROM anime WHERE id = ?', [id]);
      await query.run('DELETE FROM user_list WHERE anime_id = ?', [id]);
      await query.run('DELETE FROM watched_episodes WHERE anime_id = ?', [id]);
    }
    await logBotAction('resolve_duplicates', { title, deletedCount: idsToDelete.length }, 'SUCCESS');
    return complete('SUCCESS', `Duplicados resueltos para **${title}**. Se eliminaron ${idsToDelete.length} registro(s) redundante(s).`, { title, deletedCount: idsToDelete.length });
  }

  return complete('SUCCESS', `No se encontraron duplicados para **${title}**.`, { title });
}

export async function executeDeleteAnimeAction(actionData: AnimeIdActionPayload, complete: ActionComplete): Promise<string> {
  const animeId = Number(actionData.animeId);
  if (!animeId) return complete('REJECTED', 'ID de anime no válido para eliminar.', actionData);

  const anime = await query.get('SELECT title FROM anime WHERE id = ?', [animeId]);
  if (!anime) return complete('REJECTED', 'El anime especificado no existe.', actionData);

  await query.run('DELETE FROM anime WHERE id = ?', [animeId]);
  await query.run('DELETE FROM user_list WHERE anime_id = ?', [animeId]);
  await query.run('DELETE FROM watched_episodes WHERE anime_id = ?', [animeId]);

  await logBotAction('delete_anime', { title: anime.title }, 'SUCCESS');
  return complete('SUCCESS', `El anime **${anime.title}** ha sido eliminado permanentemente de tu biblioteca local.`, { animeId, title: anime.title });
}
