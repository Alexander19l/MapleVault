import { query } from '../database/db';
import { logBotAction } from './actionAudit';
import type { ActionComplete } from './actionExecutionTypes';
import type { MarkWatchedActionPayload } from './actionPayloads';

export async function executeMarkWatchedAction(actionData: MarkWatchedActionPayload, complete: ActionComplete): Promise<string> {
  const animeId = Number(actionData.animeId);
  const episodeNumber = Number(actionData.episodeNumber);
  const watched = Boolean(actionData.watched);

  if (!animeId || !episodeNumber) {
    return complete('REJECTED', 'No se pudo actualizar el episodio: ID de anime o número de capítulo inválido.', actionData);
  }

  const anime = await query.get('SELECT title FROM anime WHERE id = ?', [animeId]);
  if (!anime) return complete('REJECTED', 'El anime especificado no existe.', actionData);

  if (watched) {
    await query.run('INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)', [animeId, episodeNumber]);
  } else {
    await query.run('DELETE FROM watched_episodes WHERE anime_id = ? AND episode_number = ?', [animeId, episodeNumber]);
  }

  const countRow = await query.get('SELECT COUNT(*) as cnt FROM watched_episodes WHERE anime_id = ?', [animeId]);
  const watchedCount = countRow ? countRow.cnt : 0;
  await query.run('UPDATE user_list SET episodes_watched = ?, updated_at = CURRENT_TIMESTAMP WHERE anime_id = ?', [watchedCount, animeId]);

  await logBotAction('mark_watched', { title: anime.title, episodeNumber, watched }, 'SUCCESS');
  return complete('SUCCESS', `Listo. He marcado el **Capítulo ${episodeNumber}** de **${anime.title}** como ${watched ? 'visto' : 'no visto'}.`, { title: anime.title, episodeNumber, watched });
}

export async function executeMarkAllWatchedAction(actionData: Record<string, unknown>, complete: ActionComplete): Promise<string> {
  const rows = await query.all(`
    SELECT ul.anime_id, a.title, COALESCE(a.episodes, 0) as episodes
    FROM user_list ul
    JOIN anime a ON ul.anime_id = a.id
    WHERE ul.watch_status IN ('watching', 'plan_to_watch')
  `);

  const completedAt = new Date().toISOString().split('T')[0];
  for (const row of rows) {
    const episodeCount = Math.min(Number(row.episodes) || 0, 10000);
    for (let episodeNumber = 1; episodeNumber <= episodeCount; episodeNumber++) {
      await query.run('INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)', [row.anime_id, episodeNumber]);
    }
    await query.run(`
      UPDATE user_list
      SET watch_status = 'completed',
          episodes_watched = CASE WHEN ? > 0 THEN ? ELSE episodes_watched END,
          completed_at = COALESCE(completed_at, ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE anime_id = ?
    `, [episodeCount, episodeCount, completedAt, row.anime_id]);
  }

  await logBotAction('mark_all_watched', { affected: rows.length }, 'SUCCESS');
  return complete('SUCCESS', `Listo. Marqué como completadas ${rows.length} series en progreso o pendientes.`, { affected: rows.length });
}
