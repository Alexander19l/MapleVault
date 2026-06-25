export const CHATBOT_ALLOWED_ACTIONS = [
  'add_anime',
  'resolve_duplicates',
  'update_status',
  'update_score',
  'remove_from_list',
  'clear_user_list',
  'mark_watched',
  'mark_all_watched',
  'batch_update_status',
  'delete_anime',
  'sync_all'
] as const;

export type ChatbotActionType = typeof CHATBOT_ALLOWED_ACTIONS[number];

const CHATBOT_WRITE_ACTIONS = new Set<string>(CHATBOT_ALLOWED_ACTIONS);

export function isAllowedChatbotAction(actionType: string): actionType is ChatbotActionType {
  return CHATBOT_ALLOWED_ACTIONS.includes(actionType as ChatbotActionType);
}

export function requiresChatbotConfirmation(actionType: string): boolean {
  return CHATBOT_WRITE_ACTIONS.has(actionType);
}
