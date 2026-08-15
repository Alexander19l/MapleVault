import { describe, expect, it } from 'vitest';
import { isAllowedCorsOrigin } from '../corsPolicy';

describe('política CORS local de MapleVault', () => {
  it('admite el origen null de Electron solamente con token de sesión', () => {
    expect(isAllowedCorsOrigin('null', true)).toBe(true);
    expect(isAllowedCorsOrigin('null', false)).toBe(false);
  });

  it('mantiene los orígenes de desarrollo y solicitudes sin Origin', () => {
    expect(isAllowedCorsOrigin(undefined, false)).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5173', false)).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5174', false)).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5179', false)).toBe(true);
    expect(isAllowedCorsOrigin('file://', true)).toBe(true);
  });

  it('rechaza sitios web externos', () => {
    expect(isAllowedCorsOrigin('https://example.com', true)).toBe(false);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5180', false)).toBe(false);
  });
});
