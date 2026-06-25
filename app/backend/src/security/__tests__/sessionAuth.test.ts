import { describe, expect, it, vi } from 'vitest';
import { createSessionAuthMiddleware } from '../sessionAuth';

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status } as any, status, json };
}

describe('createSessionAuthMiddleware', () => {
  it('mantiene compatibilidad cuando no hay token configurado', () => {
    const next = vi.fn();
    createSessionAuthMiddleware('')({
      method: 'GET',
      path: '/anime',
      header: vi.fn()
    } as any, createResponse().response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('permite health y preflight sin exponer el resto de la API', () => {
    const middleware = createSessionAuthMiddleware('secret');
    const healthNext = vi.fn();
    const optionsNext = vi.fn();

    middleware({ method: 'GET', path: '/health', header: vi.fn() } as any, createResponse().response, healthNext);
    middleware({ method: 'OPTIONS', path: '/anime', header: vi.fn() } as any, createResponse().response, optionsNext);

    expect(healthNext).toHaveBeenCalledOnce();
    expect(optionsNext).toHaveBeenCalledOnce();
  });

  it('rechaza solicitudes sin token o con token incorrecto', () => {
    const middleware = createSessionAuthMiddleware('secret');
    const missing = createResponse();
    const invalid = createResponse();

    middleware(
      { method: 'GET', path: '/anime', header: vi.fn(() => undefined) } as any,
      missing.response,
      vi.fn()
    );
    middleware(
      { method: 'GET', path: '/anime', header: vi.fn(() => 'wrong') } as any,
      invalid.response,
      vi.fn()
    );

    expect(missing.status).toHaveBeenCalledWith(401);
    expect(invalid.status).toHaveBeenCalledWith(401);
  });

  it('permite solicitudes con el token correcto', () => {
    const next = vi.fn();
    createSessionAuthMiddleware('secret')({
      method: 'GET',
      path: '/anime',
      header: vi.fn(() => 'secret')
    } as any, createResponse().response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
