import { query } from '../database/db';
import { decorateResult, inferSeasonNumberFromTitle } from './animeResultUtils';
import type { ChatResponse } from './chatResponse';
import { setLastSearchContext } from './memory';
import { searchOnlineSources } from './onlineAnimeSearch';
import { resolveReferenceOrTitle } from './referenceResolver';
import type { NLPResult } from './types';

export async function handleBatchUpdateStatus(entities: NLPResult['entities']): Promise<ChatResponse> {
  const reference = entities.refIndexOrTitle || entities.animeTitle || entities.query;
  const seasons = Array.isArray(entities.seasons) ? entities.seasons : [];
  const status = entities.status || 'completed';

  if (!reference || seasons.length === 0) {
    return { text: 'Para actualizar por lote necesito título y temporadas. Ejemplo: "marca temporada 1 y 2 de Code Geass como vistas".' };
  }

  const rows = await query.all(`
    SELECT id, title, episodes
    FROM anime
    WHERE LOWER(title) LIKE ?
       OR LOWER(title_romaji) LIKE ?
       OR LOWER(title_english) LIKE ?
    ORDER BY COALESCE(year, 9999) ASC, id ASC
    LIMIT 20
  `, [`%${String(reference).toLowerCase()}%`, `%${String(reference).toLowerCase()}%`, `%${String(reference).toLowerCase()}%`]);

  const selected = rows.filter((row: any) => {
    const inferred = inferSeasonNumberFromTitle(row.title);
    return inferred ? seasons.includes(inferred) : seasons.includes(1);
  });

  if (selected.length === 0) {
    return { text: `No pude resolver con claridad las temporadas ${seasons.join(', ')} de "${reference}". No preparé ninguna acción para evitar cambios incorrectos.` };
  }

  return {
    text: `Preparé una actualización por lote para ${selected.length} registro(s) de "${reference}". Requiere confirmación antes de modificar la lista.`,
    visualData: { type: 'anime_list', data: selected.map(row => decorateResult(row, 'local')) },
    action: {
      type: 'batch_update_status',
      data: {
        animeIds: selected.map((row: any) => row.id),
        status,
        markEpisodesWatched: status === 'completed',
        seasons,
        title: reference
      },
      confirmMessage: `Actualizar temporadas ${seasons.join(', ')} de ${reference} como ${status}`
    }
  };
}

export function handleSyncMetadata(): ChatResponse {
  return {
    text: 'La sincronización masiva de metadatos consultará a internet para actualizar tu biblioteca. ¿Estás seguro?',
    action: {
      type: 'sync_all',
      data: {},
      confirmMessage: '¿Iniciar sincronización masiva?'
    }
  };
}

export async function handleAddToLibrary(entities: NLPResult['entities']): Promise<ChatResponse> {
  const reference = entities.refIndexOrTitle || entities.animeTitle || entities.query;
  if (!reference) {
    return { text: 'Dime qué serie quieres agregar. También puedes buscar primero y luego escribir "agrega el 2".' };
  }

  let animeToAdd = await resolveReferenceOrTitle(reference);
  if (animeToAdd?.id && animeToAdd.result_origin === 'local') {
    return { text: `"${animeToAdd.title}" ya existe en tu catálogo local.` };
  }

  if (!animeToAdd) {
    const onlineResults = await searchOnlineSources(String(reference));
    await setLastSearchContext(onlineResults);
    animeToAdd = onlineResults[0];
  }

  if (!animeToAdd) {
    return { text: `No encontré una serie verificada para "${reference}". Prueba con otro título.` };
  }

  const status = entities.status || 'plan_to_watch';
  return {
    text: `Encontré "${animeToAdd.title}". Confirma si quieres agregarla como ${status}.`,
    visualData: { type: 'anime_list', data: [animeToAdd] },
    action: {
      type: 'add_anime',
      data: { ...animeToAdd, watch_status: status },
      confirmMessage: `Agregar ${animeToAdd.title} como ${status}`
    }
  };
}

export async function handleRemoveFromLibrary(entities: NLPResult['entities']): Promise<ChatResponse> {
  const target = await resolveReferenceOrTitle(entities.refIndexOrTitle || entities.animeTitle || entities.query);
  if (!target || !target.id) {
    return { text: 'No encontré esa serie en tu catálogo local para eliminarla.' };
  }

  if (target.result_origin && target.result_origin !== 'local') {
    return { text: 'Ese resultado viene de una búsqueda online y todavía no está en tu catálogo local.' };
  }

  return {
    text: `Encontré "${target.title}". ¿Estás seguro de que deseas eliminarlo de tu catálogo local?`,
    action: {
      type: 'delete_anime',
      data: { animeId: target.id, title: target.title },
      confirmMessage: `Eliminar ${target.title} de la biblioteca`
    }
  };
}

export async function handleUpdateStatus(entities: NLPResult['entities']): Promise<ChatResponse> {
  const target = await resolveReferenceOrTitle(entities.refIndexOrTitle || entities.animeTitle || entities.query);
  const status = entities.status;
  const validStatuses = ['watching', 'plan_to_watch', 'completed', 'dropped', 'on_hold'];

  if (!target?.id || target.result_origin === 'online') {
    return { text: 'No encontré esa serie en el catálogo local para cambiar su estado.' };
  }
  if (!status || !validStatuses.includes(status)) {
    return { text: 'Indica un estado válido: viendo, pendiente, completado, pausado o abandonado.' };
  }

  return {
    text: `Preparé el cambio de estado de "${target.title}" a ${status}.`,
    action: {
      type: 'update_status',
      data: { animeId: target.id, watchStatus: status },
      confirmMessage: `Cambiar el estado de ${target.title} a ${status}`
    }
  };
}

export async function handleRateAnime(entities: NLPResult['entities']): Promise<ChatResponse> {
  const target = await resolveReferenceOrTitle(entities.refIndexOrTitle || entities.animeTitle || entities.query);
  const score = Number(entities.score);

  if (!target?.id || target.result_origin === 'online') {
    return { text: 'No encontré esa serie en el catálogo local para calificarla.' };
  }
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return { text: 'La calificación debe estar entre 0 y 10.' };
  }

  return {
    text: `Preparé la calificación de "${target.title}" con ${score}/10.`,
    action: {
      type: 'update_score',
      data: { animeId: target.id, userScore: score },
      confirmMessage: `Calificar ${target.title} con ${score}/10`
    }
  };
}

export async function handleRemoveFromList(entities: NLPResult['entities']): Promise<ChatResponse> {
  const target = await resolveReferenceOrTitle(entities.refIndexOrTitle || entities.animeTitle || entities.query);
  if (!target?.id || target.result_origin === 'online') {
    return { text: 'No encontré esa serie en el catálogo local para quitarla de tu lista.' };
  }

  return {
    text: `Preparé la eliminación de "${target.title}" de tu lista personal. El registro seguirá disponible en el catálogo.`,
    action: {
      type: 'remove_from_list',
      data: { animeId: target.id },
      confirmMessage: `Quitar ${target.title} de la lista personal`
    }
  };
}

export function handleClearUserList(): ChatResponse {
  return {
    text: 'Preparé la limpieza completa de tu lista personal. El catálogo local se conservará.',
    action: {
      type: 'clear_user_list',
      data: {},
      confirmMessage: 'Quitar todas las series de la lista personal'
    }
  };
}
