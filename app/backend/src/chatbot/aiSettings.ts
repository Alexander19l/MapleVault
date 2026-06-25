import { query } from '../database/db';
import { validateLocalServiceUrl } from '../security/validators';

export interface AISettings {
  provider: string; // 'ollama', 'llamacpp', 'lmstudio', 'custom'
  model: string;
  url: string;
  temperature: number;
  contextLimit: number;
  maxTokens: number;
  enabled: boolean;
}

const DEFAULT_SETTINGS: AISettings = {
  provider: 'ollama',
  model: 'llama3.2',
  url: 'http://localhost:11434',
  temperature: 0.1, // Lower temperature to avoid hallucination
  contextLimit: 8192, // Increased context limit for Llama 3.2
  maxTokens: 1000,
  enabled: false
};

export async function getAISettings(): Promise<AISettings> {
  const rows = await query.all('SELECT key, value FROM ai_settings');
  const settings = { ...DEFAULT_SETTINGS };
  
  rows.forEach((row: any) => {
    try {
      const val = JSON.parse(row.value);
      (settings as any)[row.key] = val;
    } catch (e) {
      // ignore parse errors
    }
  });
  
  // Force llama3.2 and ollama to avoid hallucinations with arbitrary models
  settings.model = 'llama3.2';
  settings.provider = 'ollama';
  
  return settings;
}

export const getAiSettings = getAISettings;

export async function setAISettings(newSettings: Partial<AISettings>): Promise<void> {
  const current = await getAISettings();
  const candidate = { ...current, ...newSettings };
  const validatedUrl = validateLocalServiceUrl(candidate.url);
  if (!validatedUrl.valid) {
    throw new Error(validatedUrl.reason);
  }

  const sanitizedSettings: AISettings = {
    provider: 'ollama',
    model: 'llama3.2',
    url: validatedUrl.url,
    temperature: Math.min(Math.max(Number(candidate.temperature) || 0.1, 0), 1),
    contextLimit: Math.min(Math.max(Math.trunc(Number(candidate.contextLimit) || 8192), 512), 32768),
    maxTokens: Math.min(Math.max(Math.trunc(Number(candidate.maxTokens) || 1000), 64), 4096),
    enabled: Boolean(candidate.enabled)
  };

  for (const [key, settingValue] of Object.entries(sanitizedSettings)) {
    const value = JSON.stringify(settingValue);
    await query.run(
      `INSERT INTO ai_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      [key, value]
    );
  }
}

export async function resetAISettings(): Promise<void> {
  await query.run('DELETE FROM ai_settings');
}
