import { query } from '../database/db';
import { splitGenres } from '../recommendations/scoring';
import { decorateAnimeListWithSpanishTranslation } from '../translation/translationService';
import { decorateResult, formatAnimeInfo } from './animeResultUtils';
import type { ChatResponse } from './chatResponse';
import {
  clearPagedResultsCursor,
  clearRemoteSearchCursor,
  getCatalogCursor,
  setCatalogCursor,
  setLastSearchContext
} from './memory';
import { resolveReferenceOrTitle } from './referenceResolver';
import { startPagedAnimeResults } from './resultPagination';
import type { NLPResult } from './types';

const CATALOG_PAGE_SIZE = 8;

interface CatalogFilters {
  status?: string;
  genres: string[];
}

function buildCatalogFilter(filters: CatalogFilters) {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.status) {
    conditions.push('ul.watch_status = ?');
    params.push(filters.status);
  }

  if (filters.genres.length > 0) {
    conditions.push(`
      a.id IN (
        SELECT ag2.anime_id
        FROM anime_genres ag2
        JOIN genres g2 ON ag2.genre_id = g2.id
        WHERE LOWER(g2.name) IN (${filters.genres.map(() => '?').join(', ')})
        GROUP BY ag2.anime_id
        HAVING COUNT(DISTINCT LOWER(g2.name)) >= ?
      )
    `);
    params.push(...filters.genres, filters.genres.length);
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

async function loadCatalogPage(filters: CatalogFilters, offset: number): Promise<ChatResponse> {
  const { whereSql, params } = buildCatalogFilter(filters);
  const totalRow = await query.get(`
    SELECT COUNT(*) as count
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    ${whereSql}
  `, params);
  const total = Number(totalRow?.count) || 0;

  if (total === 0) {
    await setCatalogCursor({
      offset: 0,
      pageSize: CATALOG_PAGE_SIZE,
      total: 0,
      filters
    });
    return {
      text: 'No encontré series en tu catálogo con esos filtros.',
      visualData: {
        type: 'anime_page',
        data: { items: [], page: 0, totalPages: 0, total: 0, hasMore: false, hasPrevious: false }
      }
    };
  }

  if (offset >= total) {
    return {
      text: `Ya viste las ${total} series disponibles para esta consulta.`
    };
  }

  const rows = await query.all(`
    SELECT a.*, ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched
    FROM anime a
    LEFT JOIN user_list ul ON a.id = ul.anime_id
    ${whereSql}
    ORDER BY a.updated_at DESC, a.id DESC
    LIMIT ? OFFSET ?
  `, [...params, CATALOG_PAGE_SIZE, offset]);
  const decorated = await decorateAnimeListWithSpanishTranslation(
    rows.map(row => decorateResult(row, 'local')),
    { maxRowsToTranslate: CATALOG_PAGE_SIZE }
  );
  const nextOffset = offset + decorated.length;
  const hasMore = nextOffset < total;
  const page = Math.floor(offset / CATALOG_PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE);

  await Promise.all([
    setLastSearchContext(decorated),
    setCatalogCursor({
      offset: nextOffset,
      pageSize: CATALOG_PAGE_SIZE,
      total,
      filters
    })
  ]);

  return {
    text: hasMore
      ? `Catálogo: página ${page} de ${totalPages}. Mostrando ${decorated.length} de ${total} series.`
      : `Catálogo: página ${page} de ${totalPages}. Ya estás en la última página.`,
    visualData: {
      type: 'anime_page',
      data: {
        items: decorated,
        page,
        totalPages,
        total,
        hasMore,
        hasPrevious: page > 1,
        nextPrompt: 'ver más series',
        previousPrompt: 'página anterior',
        pagePromptPrefix: 'ir a la página'
      }
    }
  };
}

export async function handleViewCatalog(entities: NLPResult['entities']): Promise<ChatResponse> {
  await Promise.all([
    clearPagedResultsCursor(),
    clearRemoteSearchCursor()
  ]);
  return loadCatalogPage({
    status: entities.status ? String(entities.status) : undefined,
    genres: splitGenres(entities.genre)
  }, 0);
}

export async function handleContinueCatalog(): Promise<ChatResponse> {
  const cursor = await getCatalogCursor();
  if (!cursor) {
    return {
      text: 'No hay un catálogo reciente para continuar. Escribe "mi catálogo" para iniciar una consulta.'
    };
  }

  const currentPage = Math.max(1, Math.ceil(Math.min(cursor.offset, cursor.total) / cursor.pageSize));
  const totalPages = Math.ceil(cursor.total / cursor.pageSize);
  if (currentPage >= totalPages) {
    return { text: `Ya viste las ${cursor.total} series disponibles para esta consulta.` };
  }

  return loadCatalogPage(cursor.filters, currentPage * cursor.pageSize);
}

export async function handlePreviousCatalog(): Promise<ChatResponse> {
  const cursor = await getCatalogCursor();
  if (!cursor) {
    return {
      text: 'No hay un catálogo reciente para retroceder. Escribe "mi catálogo" para iniciar una consulta.'
    };
  }

  const currentPage = Math.max(1, Math.ceil(Math.min(cursor.offset, cursor.total) / cursor.pageSize));
  if (currentPage <= 1) {
    return { text: 'Ya estás en la primera página del catálogo.' };
  }

  return loadCatalogPage(cursor.filters, (currentPage - 2) * cursor.pageSize);
}

export async function handleCatalogPage(pageNumber: number): Promise<ChatResponse> {
  const cursor = await getCatalogCursor();
  if (!cursor) {
    return {
      text: 'No hay un catálogo reciente para navegar. Escribe "mi catálogo" para iniciar una consulta.'
    };
  }

  const totalPages = Math.ceil(cursor.total / cursor.pageSize);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
    return { text: `La página ${pageNumber} no existe. Este catálogo tiene ${totalPages} páginas.` };
  }

  return loadCatalogPage(cursor.filters, (pageNumber - 1) * cursor.pageSize);
}

export async function handleShowAnimeInfo(entities: NLPResult['entities']): Promise<ChatResponse> {
  const target = await resolveReferenceOrTitle(entities.refIndexOrTitle || entities.animeTitle || entities.query);
  if (!target) {
    return { text: 'No pude resolver esa serie. Haz una búsqueda primero o escribe un título más específico.' };
  }
  return {
    text: formatAnimeInfo(target),
    visualData: { type: 'anime_list', data: [target] }
  };
}

export async function handleSearchPending(): Promise<ChatResponse> {
  const pendings = await query.all(`
    SELECT a.* FROM user_list ul
    JOIN anime a ON ul.anime_id = a.id
    WHERE ul.watch_status = 'plan_to_watch' OR ul.watch_status = 'watching'
    ORDER BY ul.updated_at DESC, a.id DESC
    LIMIT 32
  `);
  if (pendings.length === 0) {
    return {
      text: 'No tienes animes pendientes o en progreso guardados en tu biblioteca local.',
      visualData: { type: 'anime_page', data: { items: [], page: 0, total: 0, hasMore: false } }
    };
  }

  const decoratedPendings = await decorateAnimeListWithSpanishTranslation(
    pendings.map(row => decorateResult(row, 'local')),
    { maxRowsToTranslate: 12 }
  );

  return startPagedAnimeResults({
    mode: 'pending',
    label: 'Pendientes y en progreso',
    items: decoratedPendings,
    text: `Tienes ${decoratedPendings.length} series pendientes o en progreso.`
  });
}

export async function handleSearchCompleted(): Promise<ChatResponse> {
  const completeds = await query.all(`
    SELECT a.* FROM user_list ul
    JOIN anime a ON ul.anime_id = a.id
    WHERE ul.watch_status = 'completed'
    ORDER BY ul.updated_at DESC, a.id DESC
    LIMIT 32
  `);
  if (completeds.length === 0) {
    return { text: 'Aún no has completado ningún anime en tu biblioteca local.' };
  }

  const decoratedCompleteds = await decorateAnimeListWithSpanishTranslation(
    completeds.map(row => decorateResult(row, 'local')),
    { maxRowsToTranslate: 12 }
  );

  return startPagedAnimeResults({
    mode: 'completed',
    label: 'Series completadas',
    items: decoratedCompleteds,
    text: `Has completado ${decoratedCompleteds.length} series disponibles en esta consulta.`
  });
}

export async function handleLibraryStats(): Promise<ChatResponse> {
  const total = await query.get('SELECT COUNT(*) as count FROM anime');
  const userTotal = await query.get('SELECT COUNT(*) as count FROM user_list');
  const userListStats = await query.all('SELECT watch_status, COUNT(*) as count FROM user_list GROUP BY watch_status');

  const formatStatus = (status: string) => status === 'completed'
    ? 'Completados'
    : status === 'watching'
      ? 'Viendo'
      : status === 'plan_to_watch'
        ? 'Pendientes'
        : 'Abandonados';

  const formattedStats = userListStats.map((statusRow: any) => ({
    label: formatStatus(statusRow.watch_status),
    value: statusRow.count,
    percent: userTotal.count > 0 ? Math.round((statusRow.count / userTotal.count) * 100) : 0
  }));

  return {
    text: `Tienes un total de **${total.count}** animes en tu biblioteca local.`,
    visualData: { type: 'stats', data: formattedStats }
  };
}

export async function handleFindDuplicates(): Promise<ChatResponse> {
  const duplicates = await query.all(`
    SELECT title, COUNT(*) as count, GROUP_CONCAT(source) as sources
    FROM anime
    GROUP BY LOWER(title)
    HAVING COUNT(*) > 1
  `);

  if (duplicates.length > 0) {
    return {
      text: `He encontrado ${duplicates.length} posibles duplicados en tu base de datos.`,
      visualData: { type: 'anime_duplicates', data: duplicates }
    };
  }

  return { text: 'Tu biblioteca está limpia. No he encontrado animes duplicados.' };
}
