import { describe, expect, it } from 'vitest';
import { enforceSupportedAppearance } from '../settingsPolicy';

describe('política de apariencia de MapleVault', () => {
  it('migra configuraciones antiguas de tema claro al tema Violeta por defecto', () => {
    expect(enforceSupportedAppearance({
      theme: 'light',
      language: 'en',
      closeBehavior: 'minimize'
    })).toEqual({
      theme: 'violet',
      language: 'es',
      closeBehavior: 'minimize'
    });
  });

  it('migra el valor histórico "dark" (nombre previo del tema Violeta) sin perder la instalación', () => {
    expect(enforceSupportedAppearance({ theme: 'dark' }).theme).toBe('violet');
  });

  it('acepta los dos temas soportados: Violeta y Ember', () => {
    expect(enforceSupportedAppearance({ theme: 'violet' }).theme).toBe('violet');
    expect(enforceSupportedAppearance({ theme: 'ember' }).theme).toBe('ember');
  });

  it('conserva ajustes ajenos a apariencia', () => {
    const normalized = enforceSupportedAppearance({
      theme: 'unknown',
      translation: { enabled: true }
    });

    expect(normalized.theme).toBe('violet');
    expect(normalized.language).toBe('es');
    expect(normalized.translation).toEqual({ enabled: true });
  });
});
