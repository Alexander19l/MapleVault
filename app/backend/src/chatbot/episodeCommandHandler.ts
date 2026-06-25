import { query } from '../database/db';
import type { ChatResponse } from './chatResponse';
import type { NLPResult } from './types';

export async function handleShowEpisodes(entities: NLPResult['entities']): Promise<ChatResponse> {
  if (!entities.animeTitle) {
    return { text: 'Por favor dime de qué anime quieres ver los capítulos.' };
  }

  const anime = await query.get('SELECT id, title, episodes FROM anime WHERE title LIKE ?', [`%${entities.animeTitle}%`]);
  if (!anime) {
    return { text: `No tengo el anime "${entities.animeTitle}" en tu biblioteca.` };
  }

  const watched = await query.all('SELECT episode_number FROM watched_episodes WHERE anime_id = ?', [anime.id]);
  const watchedNums = watched.map((watchedRow: any) => watchedRow.episode_number);

  return {
    text: `La serie **${anime.title}** tiene un total de ${anime.episodes || '?'} capítulos. Has visto ${watchedNums.length} capítulos.`
  };
}

export function handleMarkAllWatched(): ChatResponse {
  return {
    text: '¿Estás seguro de que deseas marcar todos tus capítulos pendientes como vistos? Esto actualizará tu progreso global.',
    action: {
      type: 'mark_all_watched',
      data: {},
      confirmMessage: 'Marcar todo como visto'
    }
  };
}

export async function handleFilterEpisodesPending(): Promise<ChatResponse> {
  const watching = await query.all(`
    SELECT a.id, a.title, a.episodes
    FROM user_list ul
    JOIN anime a ON ul.anime_id = a.id
    WHERE ul.watch_status = 'watching'
    LIMIT 5
  `);

  if (watching.length === 0) {
    return { text: 'No estás viendo ninguna serie actualmente, así que no hay capítulos pendientes.' };
  }

  const pendingList: string[] = [];
  for (const anime of watching) {
    const lastWatched = await query.get('SELECT MAX(episode_number) as max_ep FROM watched_episodes WHERE anime_id = ?', [anime.id]);
    const nextEpisode = (lastWatched?.max_ep || 0) + 1;
    if (!anime.episodes || nextEpisode <= anime.episodes) {
      pendingList.push(`- **${anime.title}**: Capítulo ${nextEpisode}`);
    }
  }

  if (pendingList.length === 0) {
    return { text: 'No tienes capítulos pendientes.' };
  }

  return {
    text: `Estos son algunos de tus próximos capítulos pendientes:\n${pendingList.join('\n')}`
  };
}

export async function handleLastWatchedEpisode(): Promise<ChatResponse> {
  const lastWatched = await query.get(`
    SELECT a.title, w.episode_number, w.watched_at
    FROM watched_episodes w
    JOIN anime a ON w.anime_id = a.id
    ORDER BY w.id DESC
    LIMIT 1
  `);

  if (!lastWatched) {
    return { text: 'No tienes registro de capítulos vistos aún.' };
  }

  return {
    text: `El último capítulo que viste fue el **Episodio ${lastWatched.episode_number}** de **${lastWatched.title}**.`
  };
}

export async function handleFilterEpisodesWatched(): Promise<ChatResponse> {
  const recentlyWatched = await query.all(`
    SELECT a.title, w.episode_number, w.watched_at
    FROM watched_episodes w
    JOIN anime a ON w.anime_id = a.id
    ORDER BY w.watched_at DESC
    LIMIT 5
  `);

  if (recentlyWatched.length === 0) {
    return { text: 'No tienes capítulos vistos recientemente.' };
  }

  return {
    text: `Estos son los últimos capítulos que has visto:\n${recentlyWatched.map((episode: any) => `- **${episode.title}** (Cap. ${episode.episode_number})`).join('\n')}`
  };
}
