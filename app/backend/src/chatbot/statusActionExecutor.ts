import { query, withTransaction } from '../database/db';
import { logBotAction } from './actionAudit';
import type { ActionComplete } from './actionExecutionTypes';
import type {
  AnimeIdActionPayload,
  BatchUpdateStatusActionPayload,
  UpdateScoreActionPayload,
  UpdateStatusActionPayload
} from './actionPayloads';

const VALID_WATCH_STATUSES = ['watching', 'plan_to_watch', 'completed', 'dropped', 'on_hold'];

export async function executeBatchUpdateStatusAction(actionData: BatchUpdateStatusActionPayload, complete: ActionComplete): Promise<string> {
  const animeIds = Array.isArray(actionData.animeIds)
    ? [...new Set(actionData.animeIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0))]
    : [];
  const watchStatus = String(actionData.status || 'completed');

  if (animeIds.length === 0) {
    return complete('REJECTED', 'No hay series válidas para actualizar por lote.', actionData);
  }

  if (!VALID_WATCH_STATUSES.includes(watchStatus)) {
    return complete('REJECTED', 'Estado de reproducción no válido para actualización por lote.', actionData);
  }

  const completedAt = watchStatus === 'completed' ? new Date().toISOString().split('T')[0] : null;
  let updated = 0;

  await withTransaction(async () => {
    for (const animeId of animeIds) {
      const anime = await query.get('SELECT id, title, COALESCE(episodes, 0) as episodes FROM anime WHERE id = ?', [animeId]);
      if (!anime) throw new Error(`Anime inexistente: ${animeId}`);

      const episodeCount = Math.min(Number(anime.episodes) || 0, 10000);
      if (actionData.markEpisodesWatched && episodeCount > 0) {
        for (let episodeNumber = 1; episodeNumber <= episodeCount; episodeNumber++) {
          await query.run('INSERT OR IGNORE INTO watched_episodes (anime_id, episode_number) VALUES (?, ?)', [animeId, episodeNumber]);
        }
      }

      await query.run(`
        INSERT INTO user_list (anime_id, watch_status, favorite, user_score, episodes_watched, completed_at, updated_at)
        VALUES (?, ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(anime_id) DO UPDATE SET
          watch_status = excluded.watch_status,
          episodes_watched = CASE WHEN ? > 0 THEN ? ELSE user_list.episodes_watched END,
          completed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE user_list.completed_at END,
          updated_at = CURRENT_TIMESTAMP
      `, [animeId, watchStatus, episodeCount, completedAt, episodeCount, episodeCount, completedAt, completedAt]);

      updated++;
    }
  });

  await logBotAction('batch_update_status', { updated, watchStatus }, 'SUCCESS');
  return complete('SUCCESS', `Listo. Actualicé ${updated} serie(s) a estado "${watchStatus}" en una operación atómica.`, { updated, watchStatus });
}

export async function executeUpdateStatusAction(actionData: UpdateStatusActionPayload, complete: ActionComplete): Promise<string> {
  const animeId = Number(actionData.animeId);
  const watchStatus = String(actionData.watchStatus);

  if (!animeId || !watchStatus) {
    return complete('REJECTED', 'Falta el ID del anime o el estado para actualizar.', actionData);
  }

  const anime = await query.get('SELECT title FROM anime WHERE id = ?', [animeId]);
  if (!anime) return complete('REJECTED', 'El anime especificado no existe.', actionData);

  if (!VALID_WATCH_STATUSES.includes(watchStatus)) {
    return complete('REJECTED', 'Estado de reproducción no válido.', actionData);
  }

  await query.run(`
    INSERT INTO user_list (anime_id, watch_status, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(anime_id) DO UPDATE SET
      watch_status = excluded.watch_status,
      updated_at = CURRENT_TIMESTAMP
  `, [animeId, watchStatus]);

  await logBotAction('update_status', { title: anime.title, watchStatus }, 'SUCCESS');
  const statusLabels: Record<string, string> = {
    watching: 'Viendo',
    plan_to_watch: 'Pendiente',
    completed: 'Completado',
    dropped: 'Abandonado',
    on_hold: 'Pausado'
  };

  return complete('SUCCESS', `He actualizado el estado de **${anime.title}** a **${statusLabels[watchStatus]}**.`, { animeId, title: anime.title, watchStatus });
}

export async function executeUpdateScoreAction(actionData: UpdateScoreActionPayload, complete: ActionComplete): Promise<string> {
  const animeId = Number(actionData.animeId);
  const userScore = Number(actionData.userScore);

  if (!Number.isInteger(animeId) || animeId <= 0 || !Number.isFinite(userScore) || userScore < 0 || userScore > 10) {
    return complete('REJECTED', 'El anime o la calificación no son válidos.', actionData);
  }

  const anime = await query.get('SELECT title FROM anime WHERE id = ?', [animeId]);
  if (!anime) return complete('REJECTED', 'El anime especificado no existe.', actionData);

  await query.run(`
    INSERT INTO user_list (anime_id, watch_status, user_score, updated_at)
    VALUES (?, 'plan_to_watch', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(anime_id) DO UPDATE SET
      user_score = excluded.user_score,
      updated_at = CURRENT_TIMESTAMP
  `, [animeId, userScore]);

  await logBotAction('update_score', { title: anime.title, userScore }, 'SUCCESS');
  return complete('SUCCESS', `Califiqué **${anime.title}** con **${userScore}/10**.`, { animeId, title: anime.title, userScore });
}

export async function executeRemoveFromListAction(actionData: AnimeIdActionPayload, complete: ActionComplete): Promise<string> {
  const animeId = Number(actionData.animeId);
  if (!Number.isInteger(animeId) || animeId <= 0) {
    return complete('REJECTED', 'El anime indicado no es válido.', actionData);
  }

  const anime = await query.get(`
    SELECT a.title, ul.id as user_list_id
    FROM anime a
    LEFT JOIN user_list ul ON ul.anime_id = a.id
    WHERE a.id = ?
  `, [animeId]);
  if (!anime) return complete('REJECTED', 'El anime especificado no existe.', actionData);
  if (!anime.user_list_id) return complete('SUCCESS', `**${anime.title}** no estaba en tu lista personal.`, { animeId, title: anime.title });

  await query.run('DELETE FROM user_list WHERE anime_id = ?', [animeId]);
  await logBotAction('remove_from_list', { title: anime.title }, 'SUCCESS');
  return complete('SUCCESS', `Quité **${anime.title}** de tu lista personal. Se conserva en el catálogo local.`, { animeId, title: anime.title });
}

export async function executeClearUserListAction(actionData: Record<string, never>, complete: ActionComplete): Promise<string> {
  const row = await query.get('SELECT COUNT(*) as count FROM user_list');
  const count = Number(row?.count) || 0;
  await query.run('DELETE FROM user_list');
  await logBotAction('clear_user_list', { removed: count }, 'SUCCESS');
  return complete('SUCCESS', `Limpié tu lista personal (${count} registro(s)). El catálogo local no fue eliminado.`, { removed: count });
}
