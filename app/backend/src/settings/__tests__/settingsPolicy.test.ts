import { describe, expect, it } from 'vitest';
import { enforceSupportedAppearance } from '../settingsPolicy';

describe('política de apariencia de MapleVault', () => {
  it('migra configuraciones antiguas de tema claro al tema oscuro', () => {
    expect(enforceSupportedAppearance({
      theme: 'light',
      language: 'en',
      closeBehavior: 'minimize'
    })).toEqual({
      theme: 'dark',
      language: 'es',
      closeBehavior: 'minimize'
    });
  });

  it('conserva ajustes ajenos a apariencia', () => {
    const normalized = enforceSupportedAppearance({
      theme: 'unknown',
      translation: { enabled: true }
    });

    expect(normalized.theme).toBe('dark');
    expect(normalized.language).toBe('es');
    expect(normalized.translation).toEqual({ enabled: true });
  });
});
