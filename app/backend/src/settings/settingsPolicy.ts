export interface SupportedAppearanceSettings {
  theme: 'violet' | 'ember';
  language: 'es';
}

const SUPPORTED_THEMES = new Set<SupportedAppearanceSettings['theme']>(['violet', 'ember']);

export function enforceSupportedAppearance<T extends Record<string, any>>(
  settings: T
): T & SupportedAppearanceSettings {
  return {
    ...settings,
    // 'dark' es el nombre histórico del tema Violeta (único tema que existió
    // hasta ahora); cualquier otro valor no reconocido (incluido el antiguo
    // 'light', que llegó a existir y se retiró) también cae a Violeta.
    theme: SUPPORTED_THEMES.has(settings.theme) ? settings.theme : 'violet',
    language: 'es'
  };
}
