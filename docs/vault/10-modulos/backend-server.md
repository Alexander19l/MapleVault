---
tags: [modulo, backend, critico]
estado: estable
actualizado: 2026-08-17
---

# Backend · Composición del servidor

Punto de entrada de la API local. Monta Express y define el orden de middleware, que es donde
vive la postura de seguridad del backend.

**Archivo:** `app/backend/src/server.ts`

## Orden de middleware

El orden importa y es deliberado: la autenticación va antes del rate limit, y ambos antes de
cualquier router.

| # | Middleware | Línea |
|---|---|---|
| 1 | `cors()` con callback a `isAllowedCorsOrigin` | `server.ts:33-41` |
| 2 | `express.json({ limit: '2mb' })` | `server.ts:44` |
| 3 | `express.urlencoded({ limit: '2mb' })` | `server.ts:45` |
| 4 | Cabeceras manuales + `removeHeader('X-Powered-By')` | `server.ts:48-54` |
| 5 | `createSessionAuthMiddleware()` | `server.ts:57` |
| 6 | `createRateLimitMiddleware('general')` | `server.ts:60` |
| 7 | 10 routers | `server.ts:62-70` |

## Arranque

`initDb()` → `startTranslationRuntime()` → `ensureStartupBackup()` → `schedulePeriodicBackups()`
→ `listen` (`server.ts:85-92`). Cualquier fallo en la cadena termina en `process.exit(1)`
(`server.ts:95`): el servidor no arranca a medias.

Host `127.0.0.1` por defecto (`server.ts:29`), puerto validado 1..65535 con fallback 5000
(`server.ts:25-28`).

## Notas

- **No usa `helmet`.** Las cabeceras son manuales y no incluyen CSP ni HSTS; la CSP se aplica en
  la capa Electron. Ver [[ADR-001-local-first]].
- No hay middleware de errores ni handler 404 → [[S5-errores-silenciados-rutas]].

## Enlaces

- [[backend-seguridad]] · [[backend-base-de-datos]] · [[desktop-electron]]
- [[ADR-003-puerto-dinamico-token-sesion]] · [[ADR-007-rate-limit-por-ruta]]
