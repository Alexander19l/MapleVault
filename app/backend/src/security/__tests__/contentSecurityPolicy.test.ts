import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/index.html'), 'utf8');

describe('Content Security Policy', () => {
  it('permite el backend local de Electron en un puerto dinámico', () => {
    expect(indexHtml).toContain('connect-src');
    expect(indexHtml).toContain('http://localhost:*');
    expect(indexHtml).toContain('http://127.0.0.1:*');
  });

  it('no permite conexiones HTTP genéricas fuera de loopback', () => {
    expect(indexHtml).not.toMatch(/connect-src[^"]*\shttp:\s/);
    expect(indexHtml).not.toMatch(/connect-src[^"]*\shttp:\/\/\*:\*/);
  });
});
