---
tags: [incidente, scraping, rendimiento, resuelto]
actualizado: 2026-08-17
---

# INC-003 · El scraping masivo bloqueaba la interfaz

## Síntoma

Al lanzar una sincronización de temporada o de varios años, la aplicación dejaba de responder
hasta terminar, sin progreso visible ni forma de cancelar.

## Causa

El trabajo se ejecutaba de una vez, sin lotes ni cesión de control, y sin ningún canal para
informar del avance.

## Corrección

Commit `5dc9ee58` (*Throttle massive scraping and expose live progress*) y `22be17cd` (*Control
background metadata synchronization*):

- ejecución por lotes con progreso reportado;
- `jobTracker.isRunning()` impide sincronizaciones concurrentes
  (`scrapingRoutes.ts:73-78`);
- rate limit configurable por fuente en base de datos con piso
  `MASSIVE_SYNC_MIN_DELAY_MS` (`scrapingRoutes.ts:82-86`);
- cancelación disponible.

## Regla permanente

No hacer scraping masivo en el hilo de UI. El trabajo largo va por lotes, con progreso y
cancelación. Una fuente caída debe degradar mostrando datos parciales, nunca bloquear una vista
local.

## Enlaces

- [[backend-scraping-anime]] · [[frontend-capa-datos]]
