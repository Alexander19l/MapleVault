import type { AppSettings, StoredTranslationSettings } from '../settings/appSettings';
import { enforceSupportedAppearance } from '../settings/settingsPolicy';

type NormalizeTranslationSettings = (
  raw: Partial<StoredTranslationSettings> | undefined,
  fallback: StoredTranslationSettings
) => StoredTranslationSettings;

const ALLOWED_CLOSE_BEHAVIORS = new Set<AppSettings['closeBehavior']>([
  'ask',
  'minimize',
  'quit'
]);

export function normalizeCloseBehavior(
  value: unknown,
  fallback: AppSettings['closeBehavior'] = 'ask'
): AppSettings['closeBehavior'] {
  return ALLOWED_CLOSE_BEHAVIORS.has(value as AppSettings['closeBehavior'])
    ? value as AppSettings['closeBehavior']
    : fallback;
}

const ALLOWED_THEMES = new Set<AppSettings['theme']>(['violet', 'ember']);

export function normalizeTheme(
  value: unknown,
  fallback: AppSettings['theme'] = 'violet'
): AppSettings['theme'] {
  return ALLOWED_THEMES.has(value as AppSettings['theme'])
    ? value as AppSettings['theme']
    : fallback;
}

export function buildSavedAppSettings(
  current: AppSettings,
  rawBody: any,
  normalizeTranslationSettingsForStorage: NormalizeTranslationSettings
): AppSettings {
  return enforceSupportedAppearance({
    ...current,
    theme: normalizeTheme(rawBody?.theme, current.theme),
    closeBehavior: normalizeCloseBehavior(rawBody?.closeBehavior, current.closeBehavior || 'ask'),
    translation: normalizeTranslationSettingsForStorage(
      rawBody?.translation,
      current.translation
    )
  }) as AppSettings;
}

export function getAIConnectivityEndpoint(baseUrl: string, provider: unknown): string {
  return provider === 'ollama'
    ? `${baseUrl}/api/tags`
    : `${baseUrl}/v1/models`;
}

export function hasOllamaModel(responseData: any, model: string): boolean {
  const models = Array.isArray(responseData?.models) ? responseData.models : [];
  return models.some((item: { name?: string }) =>
    item.name === model || item.name?.startsWith(`${model}:`)
  );
}
