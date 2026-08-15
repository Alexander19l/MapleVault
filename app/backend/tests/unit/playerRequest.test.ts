import { describe, expect, it } from 'vitest';
import {
  getSafePlayerReferer,
  getSafePlayerUrl,
  getSafePlayerWindowMode,
  sanitizePlayerLabel
} from '../../../desktop/electron/playerRequest';

describe('desktop player request validation', () => {
  it('acepta únicamente URLs HTTP sin credenciales', () => {
    expect(getSafePlayerUrl('https://video.example/embed/1')).toBe('https://video.example/embed/1');
    expect(getSafePlayerReferer('http://source.example/episode/1')).toBe('http://source.example/episode/1');
    expect(getSafePlayerUrl('file:///etc/passwd')).toBeNull();
    expect(getSafePlayerUrl('https://user:secret@video.example/embed/1')).toBeNull();
  });

  it('solo habilita navegación directa cuando el modo está declarado explícitamente', () => {
    expect(getSafePlayerWindowMode('direct')).toBe('direct');
    expect(getSafePlayerWindowMode('embedded')).toBe('embedded');
    expect(getSafePlayerWindowMode('anything-else')).toBe('embedded');
  });

  it('limpia etiquetas antes de usarlas como título de ventana', () => {
    expect(sanitizePlayerLabel('Death Note\u0000\n', 'Anime')).toBe('Death Note');
    expect(sanitizePlayerLabel('', 'Anime')).toBe('Anime');
  });
});
