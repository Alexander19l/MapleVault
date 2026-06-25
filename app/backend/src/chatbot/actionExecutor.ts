import { consumePendingAction } from './actionConfirmation';
import { auditActionExecution, logBotAction } from './actionAudit';
import { isAllowedChatbotAction, requiresChatbotConfirmation } from './actionPolicies';
import type { ChatbotActionType } from './actionPolicies';
import type { ActionComplete, ActionExecutionStatus } from './actionExecutionTypes';
import type { ChatbotActionPayloadMap } from './actionPayloads';
import {
  executeAddAnimeAction,
  executeDeleteAnimeAction,
  executeResolveDuplicatesAction
} from './libraryActionExecutor';
import {
  executeMarkAllWatchedAction,
  executeMarkWatchedAction
} from './episodeActionExecutor';
import {
  executeBatchUpdateStatusAction,
  executeClearUserListAction,
  executeRemoveFromListAction,
  executeUpdateScoreAction,
  executeUpdateStatusAction
} from './statusActionExecutor';
import { executeSyncAllAction } from './syncActionExecutor';

async function dispatchChatbotAction(
  actionType: string,
  actionData: any,
  complete: ActionComplete
): Promise<string | null> {
  switch (actionType) {
    case 'sync_all':
      return executeSyncAllAction(actionData, complete);
    case 'add_anime':
      return executeAddAnimeAction(actionData, complete);
    case 'resolve_duplicates':
      return executeResolveDuplicatesAction(actionData, complete);
    case 'mark_watched':
      return executeMarkWatchedAction(actionData, complete);
    case 'mark_all_watched':
      return executeMarkAllWatchedAction(actionData, complete);
    case 'batch_update_status':
      return executeBatchUpdateStatusAction(actionData, complete);
    case 'delete_anime':
      return executeDeleteAnimeAction(actionData, complete);
    case 'update_status':
      return executeUpdateStatusAction(actionData, complete);
    case 'update_score':
      return executeUpdateScoreAction(actionData, complete);
    case 'remove_from_list':
      return executeRemoveFromListAction(actionData, complete);
    case 'clear_user_list':
      return executeClearUserListAction(actionData, complete);
    default:
      return null;
  }
}

export async function executeChatbotAction<T extends ChatbotActionType>(
  actionType: T,
  actionData: ChatbotActionPayloadMap[T],
  confirmToken?: string
): Promise<string>;
export async function executeChatbotAction(
  actionType: string,
  actionData: Record<string, unknown>,
  confirmToken?: string
): Promise<string>;
export async function executeChatbotAction(actionType: string, actionData: any, confirmToken?: string): Promise<string> {
  const startedAt = Date.now();
  const complete = async (
    executionStatus: ActionExecutionStatus,
    result: string,
    auditedData = actionData,
    errorMessage = ''
  ) => {
    await auditActionExecution(actionType, auditedData, executionStatus, result, Date.now() - startedAt, errorMessage);
    return result;
  };

  if (!isAllowedChatbotAction(actionType)) {
    await logBotAction(actionType, {}, 'REJECTED: Unknown action type');
    return complete('REJECTED', 'Acción no reconocida.', {});
  }

  if (requiresChatbotConfirmation(actionType)) {
    if (!confirmToken) {
      await logBotAction(actionType, actionData, 'REJECTED: No token provided');
      return complete('REJECTED', 'Esta acción requiere una confirmación válida del sistema. Por favor, inicia la acción nuevamente desde el chat.');
    }

    const pending = consumePendingAction(confirmToken);
    if (!pending) {
      await logBotAction(actionType, actionData, 'REJECTED: Token expired or invalid');
      return complete('REJECTED', 'El token de confirmación ha expirado o no es válido. La acción fue cancelada por seguridad. Puedes iniciar la solicitud nuevamente.');
    }

    if (pending.actionType !== actionType) {
      await logBotAction(actionType, actionData, 'REJECTED: Action type mismatch');
      return complete('REJECTED', 'La acción solicitada no coincide con la confirmación pendiente. Acción cancelada.');
    }

    actionData = pending.actionData;
  }

  try {
    const result = await dispatchChatbotAction(actionType, actionData, complete);
    if (result) return result;
  } catch (err: any) {
    console.error('[Chatbot] Error al ejecutar acción:', err.message);
    await logBotAction(actionType, {}, `ERROR: ${err.message}`);
    return complete('ERROR', 'Ocurrió un error al realizar la acción. Por favor, intenta de nuevo.', actionData, err.message);
  }

  await logBotAction(actionType, {}, 'REJECTED: Unknown action type');
  return complete('REJECTED', 'Acción no reconocida.', actionData);
}
