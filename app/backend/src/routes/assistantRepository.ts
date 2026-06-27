export interface AssistantQueryClient {
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<unknown>;
}

export interface ChatHistoryMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
  visualData?: unknown;
  action?: unknown;
}

export function parseAssistantJsonField(value: unknown): unknown | undefined {
  if (!value) return undefined;

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return undefined;
  }
}

export async function getChatHistory(
  queryClient: AssistantQueryClient
): Promise<ChatHistoryMessage[]> {
  const rawHistory = await queryClient.all('SELECT * FROM chat_messages ORDER BY id ASC');

  return rawHistory.map((message: any) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
    visualData: parseAssistantJsonField(message.visual_data),
    action: parseAssistantJsonField(message.action)
  }));
}

export function clearChatHistory(queryClient: AssistantQueryClient): Promise<unknown> {
  return queryClient.run('DELETE FROM chat_messages');
}

export function getAssistantActionHistory(queryClient: AssistantQueryClient): Promise<any[]> {
  return queryClient.all(`
    SELECT id, user_prompt, detected_intent, nlp_engine, selected_tool, requires_confirmation,
           execution_status, latency_ms, error_message, created_at
    FROM assistant_prompt_runs
    ORDER BY id DESC
    LIMIT 100
  `);
}
