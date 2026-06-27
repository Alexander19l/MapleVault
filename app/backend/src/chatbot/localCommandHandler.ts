import type { NLPResult } from './types';
import type { ChatResponse } from './chatResponse';
import { getMapleAssistantCapabilities } from './capabilities';
import {
  handleCatalogPage,
  handleContinueCatalog,
  handleFindDuplicates,
  handleLibraryStats,
  handlePreviousCatalog,
  handleSearchCompleted,
  handleSearchPending,
  handleShowAnimeInfo,
  handleViewCatalog
} from './catalogCommandHandler';
import {
  handleFilterEpisodesPending,
  handleFilterEpisodesWatched,
  handleLastWatchedEpisode,
  handleMarkAllWatched,
  handleMarkEpisodeWatched,
  handleNextPendingEpisode,
  handleShowEpisodes
} from './episodeCommandHandler';
import {
  handleAddToLibrary,
  handleBatchUpdateStatus,
  handleClearUserList,
  handleRateAnime,
  handleRemoveFromList,
  handleRemoveFromLibrary,
  handleSyncMetadata,
  handleUpdateStatus
} from './libraryActionCommandHandler';
import { handleCompareAnime, handleWatchOrder } from './compareCommandHandler';
import {
  getCatalogCursor,
  getPagedResultsCursor,
  getRemoteSearchCursor
} from './memory';
import {
  handleRecallPreference,
  handleRememberDislike,
  handleRememberPreference
} from './preferenceCommandHandler';
import { handleRecommendGeneral, handleRecommendSimilar } from './recommendationCommandHandler';
import {
  continueRemoteAnimeSearch,
  previousRemoteAnimeSearch,
  showRemoteAnimeSearchPage
} from './remoteSearchPagination';
import {
  continuePagedAnimeResults,
  previousPagedAnimeResults,
  showPagedAnimeResultsPage
} from './resultPagination';
import { handleSearchAnime } from './searchCommandHandler';
import { handleCancelSync, handleSyncSummary } from './syncCommandHandler';

export type { ChatResponse } from './chatResponse';

function withResponseAliases(response: ChatResponse): ChatResponse {
  return {
    ...response,
    message: response.text,
    visual_data: response.visualData
  };
}

async function handleLocalIntentInternal(nlp: NLPResult): Promise<ChatResponse> {
  const intent = nlp.intent;
  const entities = nlp.entities;

  try {
    switch (intent) {
      case 'GREETING':
        return {
          text: 'Hola. Soy Maple Assistant. Puedo ayudarte a buscar, organizar y recomendar series desde tu biblioteca local. Escribe "ayuda" para ver más comandos.'
        };
      case 'THANKS':
        return { text: 'De nada. Cuando necesites buscar, revisar o recomendar series, dime qué quieres hacer.' };

      case 'HELP':
        {
          const capabilities = getMapleAssistantCapabilities();
          return {
            text: 'Estas son las funciones principales disponibles. Selecciona una consulta para ejecutarla.',
            visualData: {
              type: 'assistant_help',
              data: {
                categories: capabilities.categories,
                intents: capabilities.intents,
                featuredPrompts: capabilities.featuredPrompts,
                protectedActionNotice: 'Las acciones que modifican tu biblioteca requieren confirmación.'
              }
            }
          };
        }

      case 'UNSUPPORTED_DOWNLOAD':
        return { text: 'No tengo función de descarga en esta versión. MapleVault se enfoca en catálogo, búsqueda, fichas, seguimiento y recomendaciones.' };

      case 'VIEW_CATALOG': {
        return handleViewCatalog(entities);
      }

      case 'CONTINUE_CATALOG': {
        return handleContinueCatalog();
      }

      case 'CONTINUE_RESULTS': {
        if (await getRemoteSearchCursor()) {
          return continueRemoteAnimeSearch();
        }
        return continuePagedAnimeResults();
      }

      case 'CONTINUE_ACTIVE': {
        if (await getRemoteSearchCursor()) {
          return continueRemoteAnimeSearch();
        }
        if (await getPagedResultsCursor()) {
          return continuePagedAnimeResults();
        }
        if (await getCatalogCursor()) {
          return handleContinueCatalog();
        }
        return {
          text: 'No hay una lista reciente para continuar. Inicia una búsqueda, recomendación o consulta del catálogo.'
        };
      }

      case 'PREVIOUS_ACTIVE_PAGE': {
        if (await getRemoteSearchCursor()) {
          return previousRemoteAnimeSearch();
        }
        if (await getPagedResultsCursor()) {
          return previousPagedAnimeResults();
        }
        if (await getCatalogCursor()) {
          return handlePreviousCatalog();
        }
        return {
          text: 'No hay una lista reciente para retroceder. Inicia una búsqueda, recomendación o consulta del catálogo.'
        };
      }

      case 'NAVIGATE_ACTIVE_PAGE': {
        const page = Number(entities.page);
        if (!Number.isInteger(page) || page < 1) {
          return { text: 'Indica un número de página válido, por ejemplo: "ir a la página 2".' };
        }
        if (await getRemoteSearchCursor()) {
          return showRemoteAnimeSearchPage(page);
        }
        if (await getPagedResultsCursor()) {
          return showPagedAnimeResultsPage(page);
        }
        if (await getCatalogCursor()) {
          return handleCatalogPage(page);
        }
        return {
          text: 'No hay una lista reciente para navegar. Inicia una búsqueda, recomendación o consulta del catálogo.'
        };
      }

      case 'SHOW_ANIME_INFO': {
        return handleShowAnimeInfo(entities);
      }

      case 'SEARCH_PENDING': {
        return handleSearchPending();
      }

      case 'SEARCH_COMPLETED': {
        return handleSearchCompleted();
      }

      case 'SEARCH_ANIME': {
        return handleSearchAnime(entities);
      }

      case 'LIBRARY_STATS': {
        return handleLibraryStats();
      }

      case 'COMPARE_ANIME': {
        return handleCompareAnime(entities);
      }

      case 'WATCH_ORDER': {
        return handleWatchOrder(entities);
      }

      case 'BATCH_UPDATE_STATUS': {
        return handleBatchUpdateStatus(entities);
      }

      case 'UPDATE_STATUS': {
        return handleUpdateStatus(entities);
      }

      case 'RATE_ANIME': {
        return handleRateAnime(entities);
      }

      case 'REMOVE_FROM_LIST': {
        return handleRemoveFromList(entities);
      }

      case 'SYNC_LIBRARY':
      case 'SYNC_METADATA': {
        return handleSyncMetadata();
      }

      case 'CANCEL_SYNC': {
        return handleCancelSync();
      }

      case 'SYNC_SUMMARY': {
        return handleSyncSummary();
      }

      case 'FIND_DUPLICATES': {
        return handleFindDuplicates();
      }

      case 'RECOMMEND_SIMILAR': {
        return handleRecommendSimilar(entities);
      }

      case 'RECOMMEND_GENERAL': {
        return handleRecommendGeneral(entities);
      }

      case 'SHOW_EPISODES': {
        return handleShowEpisodes(entities);
      }

      case 'MARK_ALL_WATCHED': {
        return handleMarkAllWatched();
      }

      case 'MARK_EPISODE_WATCHED': {
        return handleMarkEpisodeWatched(entities);
      }

      case 'NEXT_PENDING_EPISODE': {
        return handleNextPendingEpisode();
      }

      case 'FILTER_EPISODES_PENDING': {
        return handleFilterEpisodesPending();
      }

      case 'LAST_WATCHED_EPISODE': {
        return handleLastWatchedEpisode();
      }

      case 'FILTER_EPISODES_WATCHED': {
        return handleFilterEpisodesWatched();
      }

      case 'REMEMBER_PREFERENCE': {
        return handleRememberPreference(entities);
      }

      case 'REMEMBER_DISLIKE': {
        return handleRememberDislike(entities);
      }

      case 'RECALL_PREFERENCE': {
        return handleRecallPreference();
      }

      case 'ADD_TO_LIBRARY': {
        return handleAddToLibrary(entities);
      }

      case 'REMOVE_FROM_LIBRARY': {
        return handleRemoveFromLibrary(entities);
      }

      case 'EXPLAIN_CONCEPT': {
        if (entities.concept === 'slice_of_life') {
          return { text: 'Slice of life, o recuentos de la vida, describe historias centradas en experiencias cotidianas, relaciones y desarrollo personal, normalmente sin una trama de acción dominante.' };
        }
        return { text: 'No tengo una definición verificada para ese concepto.' };
      }

      case 'CLEAR_SEARCH_FILTERS': {
        return { text: 'Los filtros conversacionales de la búsqueda quedaron restablecidos.' };
      }

      case 'CLEAR_USER_LIST': {
        return handleClearUserList();
      }

      case 'RESET_PROFILE': {
        return { text: 'El restablecimiento completo del perfil todavía no está habilitado desde el chat.' };
      }

      default:
        return { text: 'No entendí esa solicitud. Escribe "ayuda" para ver qué puedo hacer.' };
    }
  } catch (err: any) {
    console.error('Error en LocalCommandHandler:', err);
    return { text: `Ocurrió un error al procesar tu petición local: ${err.message}` };
  }
}

export async function handleLocalIntent(nlp: NLPResult): Promise<ChatResponse> {
  return withResponseAliases(await handleLocalIntentInternal(nlp));
}
