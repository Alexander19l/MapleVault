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

## Subagentes Recomendados

- `security-reviewer`: seguridad, validación, IPC, tokens, rutas y dependencias.
- `code-optimizer`: duplicación, consultas SQL, cache, carga inicial y limpieza segura.
- `scraping-analyst`: fuentes, rate limits, validación de identidad y degradación.
- `chatbot-evaluator`: intents, capacidades, memoria y pruebas semánticas.
- `manga-planner`: expansión de manga manteniendo separación anime/manga.
- `test-runner`: typecheck, tests backend/frontend y build.

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
