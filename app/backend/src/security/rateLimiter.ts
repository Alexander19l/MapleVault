/**
 * rateLimiter.ts — Rate limiting local para el backend de MapleVault
 * Previene abuso de endpoints locales y posibles ataques DoS a través de peticiones internas
 */

interface RequestRecord {
  count: number;
  resetAt: number;
  blocked: boolean;
}

interface RateLimitConfig {
  windowMs: number;  // Ventana de tiempo en ms
  maxRequests: number;  // Máximo de requests por ventana
  blockDurationMs?: number;  // Duración del bloqueo si se excede (opcional)
}

// Almacén en memoria (suficiente para una app local)
const requestStore = new Map<string, RequestRecord>();

// Limpiar registros expirados periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestStore.entries()) {
    if (record.resetAt < now && !record.blocked) {
      requestStore.delete(key);
    }
  }
}, 60000); // cada minuto

/**
 * Verifica si una clave (IP + endpoint) supera el límite de rate.
 * Devuelve true si la request es permitida, false si debe bloquearse.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  let record = requestStore.get(key);

  // Si no existe o la ventana venció, crear nuevo registro
  if (!record || record.resetAt <= now) {
    record = {
      count: 1,
      resetAt: now + config.windowMs,
      blocked: false
    };
    requestStore.set(key, record);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: record.resetAt
    };
  }

  // Si está bloqueado
  if (record.blocked) {
    const blockDuration = config.blockDurationMs || config.windowMs;
    if (now < record.resetAt + blockDuration) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    } else {
      // Desbloquear después del período de bloqueo
      record.blocked = false;
      record.count = 1;
      record.resetAt = now + config.windowMs;
      return { allowed: true, remaining: config.maxRequests - 1, resetAt: record.resetAt };
    }
  }

  // Incrementar contador
  record.count++;

  if (record.count > config.maxRequests) {
    if (config.blockDurationMs) {
      record.blocked = true;
    }
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetAt: record.resetAt
  };
}

// =====================================
// CONFIGURACIONES POR ENDPOINT
// =====================================

export const RATE_LIMITS = {
  // API general — permitir bastante porque es local
  general: { windowMs: 60000, maxRequests: 500 },
  // Scraping externo — más restrictivo para no sobrecargar servicios externos
  scraping: { windowMs: 60000, maxRequests: 20, blockDurationMs: 120000 },
  // Chat — controlar abuso del motor NLP o proveedor IA configurado
  chat: { windowMs: 60000, maxRequests: 30 },
  // Búsqueda — razonable para escritorio
  search: { windowMs: 10000, maxRequests: 50 },
};

/**
 * Middleware de Express para rate limiting por endpoint y cliente.
 * En app local, el "cliente" es siempre localhost — se usa endpoint como discriminador.
 */
export function createRateLimitMiddleware(limitKey: keyof typeof RATE_LIMITS) {
  return (req: any, res: any, next: any) => {
    const config = RATE_LIMITS[limitKey];
    const key = `${limitKey}:${req.path}`;
    const result = checkRateLimit(key, config);

    // Añadir headers informativos
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes. Por favor, espera un momento antes de continuar.',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
      });
    }

    next();
  };
}
