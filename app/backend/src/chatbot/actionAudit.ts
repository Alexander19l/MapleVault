import fs from 'fs';
import path from 'path';
import { query, DB_PATH } from '../database/db';
import { maskSensitiveData } from '../security/sanitize';
import { requiresChatbotConfirmation } from './actionPolicies';

const LOG_FILE = path.join(path.dirname(DB_PATH), 'bot_actions.log');
const MAX_LOG_BYTES = Math.max(
  256 * 1024,
  Number(process.env.MAPLEVAULT_BOT_LOG_MAX_BYTES) || 2 * 1024 * 1024
);
const MAX_ROTATED_LOGS = 3;
let logWriteQueue = Promise.resolve();

async function rotateLogIfNeeded(): Promise<void> {
  try {
    const stats = await fs.promises.stat(LOG_FILE);
    if (stats.size < MAX_LOG_BYTES) return;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (let index = MAX_ROTATED_LOGS; index >= 1; index -= 1) {
    const source = index === 1 ? LOG_FILE : `${LOG_FILE}.${index - 1}`;
    const destination = `${LOG_FILE}.${index}`;
    try {
      await fs.promises.rm(destination, { force: true });
      await fs.promises.rename(source, destination);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

export async function logBotAction(action: string, data: any, result: string) {
  const logEntry = `[${new Date().toISOString()}] ACTION: ${action} | DATA: ${maskSensitiveData(data)} | RESULT: ${result}\n`;
  logWriteQueue = logWriteQueue
    .then(async () => {
      await fs.promises.mkdir(path.dirname(LOG_FILE), { recursive: true });
      await rotateLogIfNeeded();
      await fs.promises.appendFile(LOG_FILE, logEntry, 'utf8');
    })
    .catch((error) => {
      console.error('Error writing bot log:', error);
    });

  await logWriteQueue;
}

export async function auditActionExecution(
  actionType: string,
  actionData: any,
  executionStatus: 'SUCCESS' | 'REJECTED' | 'ERROR',
  executionResult: string,
  latencyMs: number,
  errorMessage = ''
) {
  try {
    await query.run(`
      INSERT INTO assistant_prompt_runs (
        user_prompt, model_response_raw, model_response_parsed,
        detected_intent, nlp_engine, selected_tool, tool_params, requires_confirmation,
        execution_status, execution_result, latency_ms, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `[execute-action:${actionType}]`,
      '',
      JSON.stringify({ actionType, actionData: maskSensitiveData(actionData) }),
      'ACTION_EXECUTION',
      'system',
      actionType,
      maskSensitiveData(actionData),
      requiresChatbotConfirmation(actionType) ? 1 : 0,
      executionStatus,
      executionResult,
      latencyMs,
      errorMessage
    ]);
  } catch (err) {
    console.error('Error auditando ejecución de acción del chatbot:', err);
  }
}
