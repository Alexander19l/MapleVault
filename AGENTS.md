# MapleVault Agent Guide

## Objetivo

Este archivo reduce contexto repetido para Codex y subagentes que trabajen en MapleVault. Mantenerlo corto: los detalles largos viven en `docs/`.

## Rutas Críticas

- Backend API: `app/backend/src/server.ts`
- SQLite y migraciones: `app/backend/src/database/db.ts`
- Chatbot: `app/backend/src/chatbot/`
- Scraping y normalización: `app/backend/src/scraping/`
- Rutas HTTP: `app/backend/src/routes/`
- Frontend React: `app/frontend/src/`
- Electron: `app/desktop/electron/`
- Documentación técnica: `docs/`

## Reglas de Estabilidad

- No romper rutas, acciones ni contratos existentes.
- Las acciones del chatbot que modifican datos deben pasar por confirmación con token.
- No insertar datos demo en instalaciones normales.
- No agregar scraping agresivo sin rate limit, cache y validación de identidad.
- No agregar dependencias pesadas sin justificar tamaño, mantenimiento y seguridad.

## Subagentes Disponibles

Seis agentes canónicos, definidos en `~/.claude/agents/`. Están instalados y son invocables; no
inventes otros nombres.

- `code-reader`: solo lectura. Estructura, flujo, dependencias y contratos. Úsalo antes de cambiar
  una zona desconocida.
- `code-optimizer`: duplicación, consultas SQL, cache, carga inicial, rendimiento y limpieza segura.
  Clasifica cada cambio como SAFE/CAREFUL/RISKY y no aplica los RISKY por su cuenta.
- `frontend-director`: UI, React/TSX, accesibilidad y dirección visual anti-plantilla.
- `security-auditor`: solo lectura. Seguridad, validación, IPC, tokens, rutas, subidas, dependencias
  y errores silenciados. No lee `.env` ni ejecuta nada.
- `test-verifier`: ejecuta typecheck, lint, tests y build ya definidos, y reporta el primer fallo.
- `stack-maintainer`: mantiene los propios agentes y skills desde upstream. No toca código de producto.

Las capacidades de los antiguos `scraping-analyst`, `chatbot-evaluator` y `manga-planner` se cubren
combinando `code-reader` (mapear el flujo) con `security-auditor` (rate limits, validación de
identidad, degradación) y las reglas de estabilidad de arriba.

## Política de Contexto

- Leer solo archivos necesarios para la tarea.
- Usar `rg` antes de abrir archivos grandes.
- Preferir diffs acotados y reversibles.
- Para auditoría, devolver rutas concretas y riesgo antes de proponer cambios.
- Para scraping, registrar fuente, idioma, tipo de contenido, estabilidad y riesgos.

## Comandos de Verificación

- `npm run typecheck`
- `npm run typecheck:frontend`
- `npm run lint:frontend`
- `npm run test:backend`
- `npm run build`
