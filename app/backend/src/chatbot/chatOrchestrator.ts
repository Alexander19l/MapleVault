import { query } from '../database/db';
import { sanitizeChatInput, sanitizeChatResponse } from '../security/sanitize';
import { registerPendingAction } from './actionConfirmation';
import { requiresChatbotConfirmation } from './actionPolicies';
import { handleLocalIntent } from './localCommandHandler';
import type { ChatResponse } from './localCommandHandler';
import { rememberIntentRun } from './memory';
import { parseIntent } from './nlpEngine';

export async function handleChatMessage(message: string): Promise<ChatResponse> {
  const sanitizedMessage = sanitizeChatInput(message);
  if (!sanitizedMessage) return { text: '' };

  const startTime = Date.now();
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Chatbot NLP] Mensaje recibido (${sanitizedMessage.length} caracteres).`);
  }

  let nlpResult: any = { intent: 'UNKNOWN', entities: {} };
  let response: ChatResponse = { text: 'Ocurrió un error.' };
  let errorMsg = '';

  try {
    nlpResult = await parseIntent(sanitizedMessage);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Chatbot NLP] Intent detectado: ${nlpResult.intent}`);
    }

    response = await handleLocalIntent(nlpResult);
    await rememberIntentRun(nlpResult.intent, nlpResult.entities || {});
    if (!response.text && response.message) {
      response.text = response.message;
    }
    if (!response.visualData && response.visual_data) {
      response.visualData = response.visual_data;
    }
    response.text = sanitizeChatResponse(response.text);
    response.message = response.text;

    if (response.action && response.action.type && requiresChatbotConfirmation(response.action.type)) {
      const token = registerPendingAction(
        response.action.type,
        response.action.data,
        response.action.confirmMessage || 'Acción requerida'
      );
      response.action.confirmToken = token;
    }

    await query.run('INSERT INTO chat_messages (role, content) VALUES (?, ?)', ['user', sanitizedMessage.slice(0, 1000)]);
    await query.run(
      'INSERT INTO chat_messages (role, content, visual_data, action) VALUES (?, ?, ?, ?)',
      [
        'assistant',
        response.text?.slice(0, 1000) || '',
        response.visualData ? JSON.stringify(response.visualData) : null,
        response.action ? JSON.stringify(response.action) : null
      ]
    );
  } catch (err: any) {
    console.error('[Chatbot NLP] Error fatal:', err.message);
    response = {
      text: 'No pude procesar la solicitud en este momento. Intenta nuevamente o escribe "ayuda" para ver los comandos disponibles.'
    };
    errorMsg = err.message;
  }

  const latency = Date.now() - startTime;
  try {
    await query.run(`
      INSERT INTO assistant_prompt_runs (
        user_prompt, model_response_raw, model_response_parsed,
        detected_intent, nlp_engine, selected_tool, tool_params, requires_confirmation,
        execution_status, execution_result, latency_ms, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sanitizedMessage,
      '',
      JSON.stringify(nlpResult),
      nlpResult.intent,
      nlpResult.engine || 'regex',
      response.action ? response.action.type : 'none',
      JSON.stringify(nlpResult.entities || {}),
      response.action ? 1 : 0,
      errorMsg ? 'ERROR' : 'SUCCESS',
      response.text,
      latency,
      errorMsg
    ]);
  } catch (logErr) {
    console.error('Error guardando log en assistant_prompt_runs:', logErr);
  }

  return response;
}
