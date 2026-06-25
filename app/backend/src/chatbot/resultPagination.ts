import type { ChatResponse } from './chatResponse';
import {
  clearCatalogCursor,
  clearRemoteSearchCursor,
  getPagedResultsCursor,
  setLastSearchContext,
  setPagedResultsCursor,
  type PagedResultMode
} from './memory';

export const ASSISTANT_RESULT_PAGE_SIZE = 6;
const MAX_PAGED_RESULTS = 32;

interface StartPagedResultsOptions {
  mode: PagedResultMode;
  label: string;
  items: any[];
  nextPrompt?: string;
  text?: string;
}

function buildPageData(
  items: any[],
  offset: number,
  pageSize: number,
  nextPrompt: string
) {
  const pageItems = items.slice(offset, offset + pageSize);
  const nextOffset = offset + pageItems.length;
  const total = items.length;
  const page = total > 0 ? Math.floor(offset / pageSize) + 1 : 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  return {
    pageItems,
    nextOffset,
    total,
    page,
    totalPages,
    hasMore: nextOffset < total,
    hasPrevious: page > 1,
    nextPrompt
  };
}

function currentPageFromCursor(offset: number, pageSize: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.ceil(Math.min(offset, total) / pageSize));
}

function buildVisualData(pageData: ReturnType<typeof buildPageData>) {
  return {
    items: pageData.pageItems,
    page: pageData.page,
    totalPages: pageData.totalPages,
    total: pageData.total,
    hasMore: pageData.hasMore,
    hasPrevious: pageData.hasPrevious,
    nextPrompt: pageData.nextPrompt,
    previousPrompt: 'pagina anterior',
    pagePromptPrefix: 'ir a la pagina'
  };
}

export async function startPagedAnimeResults(options: StartPagedResultsOptions): Promise<ChatResponse> {
  const items = options.items.slice(0, MAX_PAGED_RESULTS);
  const nextPrompt = options.nextPrompt || 'ver más resultados';
  const pageData = buildPageData(items, 0, ASSISTANT_RESULT_PAGE_SIZE, nextPrompt);

  await Promise.all([
    clearCatalogCursor(),
    clearRemoteSearchCursor(),
    setLastSearchContext(pageData.pageItems),
    setPagedResultsCursor({
      mode: options.mode,
      label: options.label,
      offset: pageData.nextOffset,
      pageSize: ASSISTANT_RESULT_PAGE_SIZE,
      total: pageData.total,
      items,
      nextPrompt
    })
  ]);

  return {
    text: options.text || `${options.label}: página ${pageData.page} de ${pageData.totalPages}.`,
    visualData: {
      type: 'anime_page',
      data: buildVisualData(pageData)
    }
  };
}

export async function showPagedAnimeResultsPage(pageNumber: number): Promise<ChatResponse> {
  const cursor = await getPagedResultsCursor();
  if (!cursor) {
    return {
      text: 'No hay resultados recientes para navegar. Inicia una búsqueda, lista o recomendación nueva.'
    };
  }

  const totalPages = Math.ceil(cursor.total / cursor.pageSize);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
    return {
      text: `La página ${pageNumber} no existe. Esta consulta tiene ${totalPages} páginas.`
    };
  }

  const offset = (pageNumber - 1) * cursor.pageSize;
  const pageData = buildPageData(cursor.items, offset, cursor.pageSize, cursor.nextPrompt);
  await Promise.all([
    setLastSearchContext(pageData.pageItems),
    setPagedResultsCursor({
      ...cursor,
      offset: pageData.nextOffset
    })
  ]);

  return {
    text: pageData.hasMore
      ? `${cursor.label}: página ${pageData.page} de ${pageData.totalPages}.`
      : `${cursor.label}: página ${pageData.page} de ${pageData.totalPages}. Ya estás en la última página.`,
    visualData: {
      type: 'anime_page',
      data: buildVisualData(pageData)
    }
  };
}

export async function continuePagedAnimeResults(): Promise<ChatResponse> {
  const cursor = await getPagedResultsCursor();
  if (!cursor) {
    return {
      text: 'No hay resultados recientes para continuar. Inicia una búsqueda, lista o recomendación nueva.'
    };
  }

  const currentPage = currentPageFromCursor(cursor.offset, cursor.pageSize, cursor.total);
  const totalPages = Math.ceil(cursor.total / cursor.pageSize);
  if (currentPage >= totalPages) {
    return {
      text: `Ya viste los ${cursor.total} resultados disponibles de ${cursor.label.toLowerCase()}.`
    };
  }

  return showPagedAnimeResultsPage(currentPage + 1);
}

export async function previousPagedAnimeResults(): Promise<ChatResponse> {
  const cursor = await getPagedResultsCursor();
  if (!cursor) {
    return {
      text: 'No hay resultados recientes para retroceder. Inicia una búsqueda, lista o recomendación nueva.'
    };
  }

  const currentPage = currentPageFromCursor(cursor.offset, cursor.pageSize, cursor.total);
  if (currentPage <= 1) {
    return {
      text: 'Ya estás en la primera página de estos resultados.'
    };
  }

  return showPagedAnimeResultsPage(currentPage - 1);
}
