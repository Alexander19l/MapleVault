import { describe, expect, it, vi } from 'vitest';
import {
  buildAnimeFilterClause,
  buildAnimeOrderClause,
  buildNonAdultCondition
} from '../../src/routes/libraryFilters';
import {
  getErrorMessage,
  getValidatedId,
  validateBodySize
} from '../../src/routes/routeUtils';

function createResponseMock() {
  const response = {
    status: vi.fn(),
    json: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response as any;
}

describe('Library route helper filters', () => {
  it('filtra contenido adulto por defecto cuando no hay busqueda explicita', () => {
    const { whereSql, params } = buildAnimeFilterClause({}, undefined);

    expect(whereSql).toContain('a.is_adult = 0');
    expect(whereSql).toContain("g2.name = 'Hentai'");
    expect(params).toEqual([]);
  });

  it('permite busquedas explicitas sin bloquear adultos implicitamente', () => {
    const { whereSql, params } = buildAnimeFilterClause({ q: 'berserk' }, undefined);

    expect(whereSql).not.toContain('a.is_adult = 0');
    expect(whereSql).toContain('a.title LIKE ?');
    expect(params).toEqual(['%berserk%', '%berserk%', '%berserk%']);
  });

  it('combina filtros de temporada, genero, estado, tipo y score con parametros ordenados', () => {
    const { whereSql, params } = buildAnimeFilterClause({
      year: 2026,
      season: 'Winter',
      genre: 'Comedy',
      status: 'finished',
      type: 'tv',
      score: 8.5
    }, 'include');

    expect(whereSql).toContain('a.year = ?');
    expect(whereSql).toContain('a.season = ?');
    expect(whereSql).toContain('EXISTS');
    expect(params).toEqual([2026, 'winter', 'Comedy', 'finished', 'tv', 8.5]);
  });

  it('soporta filtro exclusivo de adultos', () => {
    const { whereSql } = buildAnimeFilterClause({}, 'only');

    expect(whereSql).toContain('a.is_adult = 1');
    expect(whereSql).toContain("a.age_rating LIKE '%Rx%'");
  });

  it('mantiene ordenamientos publicos soportados', () => {
    expect(buildAnimeOrderClause('title')).toBe(' ORDER BY a.title ASC ');
    expect(buildAnimeOrderClause('year_desc')).toBe(' ORDER BY a.year DESC, a.start_date DESC ');
    expect(buildAnimeOrderClause('score')).toBe(' ORDER BY a.score DESC ');
    expect(buildAnimeOrderClause(undefined)).toBe(' ORDER BY a.id DESC ');
  });

  it('construye condicion no adulta reutilizable para resumenes', () => {
    const condition = buildNonAdultCondition();

    expect(condition).toContain('COALESCE(a.is_adult, 0) = 0');
    expect(condition).toContain("g2.name = 'Hentai'");
  });
});

describe('Shared route utilities', () => {
  it('normaliza mensajes de error con fallback', () => {
    expect(getErrorMessage(new Error('fallo'))).toBe('fallo');
    expect(getErrorMessage('fallo', 'fallback')).toBe('fallback');
  });

  it('valida ids y responde 400 cuando son invalidos', () => {
    const response = createResponseMock();

    expect(getValidatedId('42', response)).toBe(42);
    expect(getValidatedId('bad', response)).toBeNull();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'ID invalido.' });
  });

  it('rechaza payloads demasiado grandes', () => {
    const response = createResponseMock();
    const ok = validateBodySize(response, { message: 'ok' });
    const tooBig = validateBodySize(response, { message: 'x'.repeat(1024 * 1024 + 1) });

    expect(ok).toBe(true);
    expect(tooBig).toBe(false);
    expect(response.status).toHaveBeenCalledWith(413);
  });
});
