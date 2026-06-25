import type { ChatResponse } from './chatResponse';
import {
  clearCatalogCursor,
  clearPagedResultsCursor,
  clearRemoteSearchCursor,
  getRemoteSearchCursor,
  setLastSearchContext,
  setRemoteSearchCursor
} from './memory';
import {
  searchOnlinePage,
  type OnlineSearchPage,
  type OnlineSearchProvider
} from './onlineAnimeSearch';

export const REMOTE_SEARCH_PAGE_SIZE = 6;
export const MAX_REMOTE_SEARCH_PAGES = 20;

function providerLabel(provider: OnlineSearchProvider): string {
  return provider === 'anilist' ? 'AniList' : 'Jikan';
}

function boundedPageInfo(result: OnlineSearchPage) {
  const totalPages = Math.min(
    MAX_REMOTE_SEARCH_PAGES,
    Math.max(result.items.length > 0 ? 1 : 0, result.totalPages)
  );
  const total = Math.min(
    Math.max(result.total, result.items.length),
    totalPages * result.pageSize
  );

  return { total, totalPages };
}

function buildVisualData(
  result: OnlineSearchPage,
  total: number,
  totalPages: number,
  nextPrompt: string
) {
  return {
    items: result.items,
    page: result.page,
    totalPages,
    total,
    hasMore: result.page < totalPages,
    hasPrevious: result.page > 1,
    nextPrompt,
    previousPrompt: 'página anterior',
    pagePromptPrefix: 'ir a la página',
    provider: providerLabel(result.provider),
    remote: true
  };
}

async function persistRemotePage(
  query: string,
  label: string,
  result: OnlineSearchPage,
  nextPrompt: string
) {
  const { total, totalPages } = boundedPageInfo(result);
  await Promise.all([
    clearCatalogCursor(),
    clearPagedResultsCursor(),
    setLastSearchContext(result.items),
    setRemoteSearchCursor({
      query,
      label,
      provider: result.provider,
      page: result.page,
      pageSize: result.pageSize,
      total,
      totalPages,
      nextPrompt
    })
  ]);
  return { total, totalPages };
}

export async function startRemoteAnimeSearch(
  query: string,
  label = `Resultados online para "${query}"`
): Promise<ChatResponse> {
  await Promise.all([
    clearCatalogCursor(),
    clearPagedResultsCursor(),
    clearRemoteSearchCursor()
  ]);
  const result = await searchOnlinePage(query, 1, REMOTE_SEARCH_PAGE_SIZE);
  if (result.items.length === 0) {
    return result.available
      ? { text: `No encontré resultados online verificados para "${query}".` }
      : { text: 'Las fuentes online no están disponibles en este momento. Intenta nuevamente en unos minutos.' };
  }

  const nextPrompt = 'ver más resultados';
  const { total, totalPages } = await persistRemotePage(query, label, result, nextPrompt);
  return {
    text: `Encontré ${total} resultados online para "${query}" en ${providerLabel(result.provider)}. Puedes abrir una ficha con "info el 1".`,
    visualData: {
      type: 'anime_page',
      data: buildVisualData(result, total, totalPages, nextPrompt)
    }
  };
}

export async function showRemoteAnimeSearchPage(pageNumber: number): Promise<ChatResponse> {
  const cursor = await getRemoteSearchCursor();
  if (!cursor) {
    return {
      text: 'No hay una búsqueda online reciente para navegar. Inicia una búsqueda nueva.'
    };
  }

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > cursor.totalPages) {
    return {
      text: `La página ${pageNumber} no existe. Esta búsqueda online tiene ${cursor.totalPages} páginas.`
    };
  }

  const result = await searchOnlinePage(
    cursor.query,
    pageNumber,
    cursor.pageSize,
    cursor.provider
  );
  if (!result.available) {
    return {
      text: `${providerLabel(cursor.provider)} no respondió. La página actual se conserva para que puedas intentarlo nuevamente.`
    };
  }
  if (result.items.length === 0) {
    return {
      text: `La página ${pageNumber} ya no tiene resultados disponibles en ${providerLabel(cursor.provider)}.`
    };
  }

  await Promise.all([
    setLastSearchContext(result.items),
    setRemoteSearchCursor({
      ...cursor,
      page: result.page
    })
  ]);

  return {
    text: result.page < cursor.totalPages
      ? `${cursor.label}: página ${result.page} de ${cursor.totalPages}.`
      : `${cursor.label}: página ${result.page} de ${cursor.totalPages}. Ya estás en la última página.`,
    visualData: {
      type: 'anime_page',
      data: buildVisualData(result, cursor.total, cursor.totalPages, cursor.nextPrompt)
    }
  };
}

export async function continueRemoteAnimeSearch(): Promise<ChatResponse> {
  const cursor = await getRemoteSearchCursor();
  if (!cursor) {
    return {
      text: 'No hay una búsqueda online reciente para continuar.'
    };
  }
  if (cursor.page >= cursor.totalPages) {
    return {
      text: `Ya viste las ${cursor.totalPages} páginas disponibles de esta búsqueda online.`
    };
  }
  return showRemoteAnimeSearchPage(cursor.page + 1);
}

export async function previousRemoteAnimeSearch(): Promise<ChatResponse> {
  const cursor = await getRemoteSearchCursor();
  if (!cursor) {
    return {
      text: 'No hay una búsqueda online reciente para retroceder.'
    };
  }
  if (cursor.page <= 1) {
    return {
      text: 'Ya estás en la primera página de esta búsqueda online.'
    };
  }
  return showRemoteAnimeSearchPage(cursor.page - 1);
}
