---
tags: [seguridad, hallazgo, backend, abierto]
severidad: baja
confianza: confirmado
actualizado: 2026-08-17
---

# S7 · Presets de rate limit definidos pero no cableados

**Severidad: baja.**

## Hecho

`security/rateLimiter.ts:93-102` define cuatro presets:

| Preset | Límite | ¿Cableado? |
|---|---|---|
| `general` | 500/min | Sí — `server.ts:60` |
| `chat` | 30/min | Sí — `assistantRoutes.ts:69` |
| `scraping` | 20/min | **No** |
| `search` | 50/10 s | **No** |

Un barrido de `createRateLimitMiddleware(` en todo el backend devuelve exactamente esas dos
llamadas.

## Impacto

Las rutas de scraping y búsqueda solo tienen el límite `general` de 500/min, mucho más laxo que
los 20/min pensados para scraping. El contenimiento real del scraping no viene de aquí sino de
`jobTracker.isRunning()` y del rate limit por fuente configurado en base de datos
(`scrapingRepository.ts:7-18`), que sí funcionan.

Por eso es baja: la protección existe, pero por otra vía, y estos presets dan una falsa
impresión de cobertura al leer el módulo.

## Corrección

Cablear `scraping` en `scrapingRoutes.ts` y `search` en las rutas de búsqueda, o eliminar los
presets no usados. Mantenerlos definidos y muertos es lo que confunde.

## Enlaces

- [[backend-seguridad]] · [[ADR-007-rate-limit-por-ruta]] · [[backend-scraping-anime]]
