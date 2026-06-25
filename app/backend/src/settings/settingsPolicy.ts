export interface SupportedAppearanceSettings {
  theme: 'dark';
  language: 'es';
}

export function enforceSupportedAppearance<T extends Record<string, any>>(
  settings: T
): T & SupportedAppearanceSettings {
  return {
    ...settings,
    theme: 'dark',
    language: 'es'
  };
}
