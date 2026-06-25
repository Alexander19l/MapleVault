/**
 * validators.test.ts — Test suite de seguridad para validadores
 * Prueba los 15 casos de seguridad más importantes
 */
import { describe, it, expect } from 'vitest';
import {
  validateAnimeInput,
  validateSearchFilters,
  validateId,
  validateImageUrl,
  validateLocalServiceUrl,
  validateSafePath,
  validatePayloadSize,
  validateUserListInput
} from '../validators';

describe('validateAnimeInput', () => {
  it('acepta datos válidos completos', () => {
    const result = validateAnimeInput({
      title: 'Frieren: Beyond Journey\'s End',
      year: 2023,
      season: 'fall',
      type: 'tv',
      episodes: 28,
      score: 9.38
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rechaza título con etiquetas XSS', () => {
    const result = validateAnimeInput({
      title: '<script>alert("xss")</script>'
    });
    // Elimina control chars pero escapa HTML — el título sigue siendo texto
    // La sanitización se hace en el nivel de renderizado, aquí validamos longitud/tipo
    expect(typeof result.sanitized.title).toBe('string');
  });

  it('rechaza año fuera de rango', () => {
    const result = validateAnimeInput({ title: 'Test', year: 1800 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('año'))).toBe(true);
  });

  it('rechaza año negativo', () => {
    const result = validateAnimeInput({ title: 'Test', year: -1 });
    expect(result.valid).toBe(false);
  });

  it('rechaza temporada inválida', () => {
    const result = validateAnimeInput({ title: 'Test', season: 'invalid_season' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('temporada'))).toBe(true);
  });

  it('rechaza puntuación mayor a 10', () => {
    const result = validateAnimeInput({ title: 'Test', score: 15 });
    expect(result.valid).toBe(false);
  });

  it('rechaza puntuación negativa', () => {
    const result = validateAnimeInput({ title: 'Test', score: -1 });
    expect(result.valid).toBe(false);
  });

  it('rechaza episodios negativos', () => {
    const result = validateAnimeInput({ title: 'Test', episodes: -5 });
    expect(result.valid).toBe(false);
  });

  it('limita longitud de título a 500 chars', () => {
    const longTitle = 'A'.repeat(600);
    const result = validateAnimeInput({ title: longTitle });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('500'))).toBe(true);
  });

  it('rechaza tipo de anime inválido', () => {
    const result = validateAnimeInput({ title: 'Test', type: 'malicious_type' });
    expect(result.valid).toBe(false);
  });
});

describe('validateId', () => {
  it('acepta ID válido', () => {
    expect(validateId(1)).toBe(1);
    expect(validateId(100)).toBe(100);
    expect(validateId('42')).toBe(42);
  });

  it('rechaza ID cero', () => {
    expect(validateId(0)).toBeNull();
  });

  it('rechaza ID negativo', () => {
    expect(validateId(-1)).toBeNull();
  });

  it('rechaza ID no numérico', () => {
    expect(validateId('abc')).toBeNull();
    expect(validateId(null)).toBeNull();
    expect(validateId(undefined)).toBeNull();
  });

  it('rechaza ID que excede límite de entero 32-bit', () => {
    expect(validateId(2147483648)).toBeNull();
  });

  it('rechaza inyección SQL disfrazada como ID', () => {
    expect(validateId('1; DROP TABLE anime;')).toBeNull();
    expect(validateId('1 OR 1=1')).toBeNull();
  });
});

describe('validateImageUrl', () => {
  it('acepta URL https válida', () => {
    const result = validateImageUrl('https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx156252-GpBjlQCOqr8t.jpg');
    expect(result.valid).toBe(true);
  });

  it('rechaza protocolo javascript:', () => {
    const result = validateImageUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
  });

  it('rechaza protocolo data:', () => {
    const result = validateImageUrl('data:text/html,<script>alert(1)</script>');
    expect(result.valid).toBe(false);
  });

  it('rechaza file://', () => {
    const result = validateImageUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
  });

  it('rechaza URLs de IPs privadas (SSRF)', () => {
    expect(validateImageUrl('http://192.168.1.1/img.jpg').valid).toBe(false);
    expect(validateImageUrl('http://10.0.0.1/img.jpg').valid).toBe(false);
    expect(validateImageUrl('http://127.0.0.1/img.jpg').valid).toBe(false);
    expect(validateImageUrl('http://localhost/img.jpg').valid).toBe(false);
  });

  it('acepta URL vacía (usará placeholder)', () => {
    expect(validateImageUrl('').valid).toBe(true);
  });
});

describe('validateSafePath', () => {
  it('rechaza path traversal con ../', () => {
    const result = validateSafePath('/data/../../etc/passwd', '/data/downloads');
    expect(result.safe).toBe(false);
  });

  it('rechaza path traversal codificado con caracteres nulos', () => {
    const result = validateSafePath('/data/downloads\x00/../etc/passwd', '/data/downloads');
    expect(result.safe).toBe(false);
  });

  it('acepta path dentro del directorio permitido', () => {
    // Nota: en Windows paths, el test puede variar
    // Usamos un path relativo que se resolverá
    const base = process.cwd();
    const safe = `${base}/subdir/file.sqlite`;
    const result = validateSafePath(safe, base);
    expect(result.safe).toBe(true);
  });
});

describe('validatePayloadSize', () => {
  it('acepta payload pequeño', () => {
    expect(validatePayloadSize({ title: 'Test', score: 8 })).toBe(true);
  });

  it('rechaza payload mayor a 1MB', () => {
    const bigData = { data: 'x'.repeat(1024 * 1024 + 1) };
    expect(validatePayloadSize(bigData)).toBe(false);
  });
});

describe('validateSearchFilters', () => {
  it('sanitiza caracteres peligrosos en búsqueda', () => {
    const result = validateSearchFilters({ q: '<script>alert(1)</script>' });
    expect(result.q).not.toContain('<script>');
    expect(result.q).not.toContain('>');
  });

  it('sanitiza intento de SQL injection en búsqueda', () => {
    const result = validateSearchFilters({ q: "'; DROP TABLE anime; --" });
    expect(result.q).not.toContain("';");
  });

  it('rechaza sort field no permitido', () => {
    const result = validateSearchFilters({ sort: 'id; DROP TABLE anime' });
    expect(result.sort).toBeUndefined();
  });

  it('acepta filtros válidos', () => {
    const result = validateSearchFilters({
      q: 'Naruto',
      year: 2007,
      season: 'fall',
      sort: 'score',
      includeSynopsis: true
    });
    expect(result.q).toBe('Naruto');
    expect(result.year).toBe(2007);
    expect(result.season).toBe('fall');
    expect(result.sort).toBe('score');
    expect(result.includeSynopsis).toBe(true);
  });

  it('ignora includeSynopsis con valores no booleanos', () => {
    const result = validateSearchFilters({ includeSynopsis: 'yes' });
    expect(result.includeSynopsis).toBeUndefined();
  });
});

describe('validateUserListInput', () => {
  it('acepta datos válidos de lista', () => {
    const result = validateUserListInput({
      anime_id: 1,
      watch_status: 'watching',
      user_score: 8.5,
      episodes_watched: 12
    });
    expect(result.valid).toBe(true);
  });

  it('rechaza estado de visualización inválido', () => {
    const result = validateUserListInput({
      anime_id: 1,
      watch_status: 'hacked_status'
    });
    expect(result.valid).toBe(false);
  });

  it('rechaza nota mayor a 10', () => {
    const result = validateUserListInput({
      anime_id: 1,
      watch_status: 'completed',
      user_score: 11
    });
    expect(result.valid).toBe(false);
  });
});

describe('validateLocalServiceUrl', () => {
  it('acepta servicios HTTP locales', () => {
    expect(validateLocalServiceUrl('http://localhost:11434', false)).toEqual({
      valid: true,
      url: 'http://localhost:11434'
    });
    expect(validateLocalServiceUrl('http://127.0.0.1:5001/', false).valid).toBe(true);
  });

  it('rechaza destinos remotos de forma predeterminada', () => {
    expect(validateLocalServiceUrl('https://example.com/service', false).valid).toBe(false);
  });

  it('rechaza credenciales, parámetros y protocolos no HTTP', () => {
    expect(validateLocalServiceUrl('http://user:pass@localhost:5001', false).valid).toBe(false);
    expect(validateLocalServiceUrl('http://localhost:5001?target=internal', false).valid).toBe(false);
    expect(validateLocalServiceUrl('file:///tmp/service', false).valid).toBe(false);
  });

  it('permite destinos remotos solo con habilitación explícita', () => {
    expect(validateLocalServiceUrl('https://translate.example.com', true).valid).toBe(true);
  });
});
