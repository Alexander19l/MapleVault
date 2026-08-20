---
tags: [decision, backend, datos]
estado: vigente
actualizado: 2026-08-17
---

# ADR-006 · Cola serie para todas las operaciones SQLite

## Contexto

SQLite con el driver `sqlite3` (callbacks) y escrituras concurrentes desde rutas HTTP, scraping
en lote y acciones del chatbot. Sin coordinación, aparecen `SQLITE_BUSY` y transacciones
entrelazadas.

## Decisión

Toda operación pasa por `enqueueDbOperation` (`db.ts:112-120`), que las serializa. Las
transacciones usan `BEGIN IMMEDIATE` con `AsyncLocalStorage` para propagar el contexto
(`db.ts:135-147`).

Configuración de apoyo: `busyTimeout 10000` (`:17`), `journal_mode=WAL`, `synchronous=NORMAL`,
`foreign_keys=ON` (`:24-26`), replicados en `reopenDatabase` (`:75-77`).

## Consecuencias

**A favor:** sin condiciones de carrera de escritura, transacciones limpias, y el swap de base de
datos en restauración de backup es seguro (`replaceDatabaseFromStaging`, `:155-199`, con
`PRAGMA integrity_check`).

**En contra:** las lecturas también se serializan, así que el throughput está limitado por la
operación más lenta en cola. Para una app local de un solo usuario es un intercambio correcto.

## Nota sobre la documentación

`MAPLEVAULT_CLAUDE_CONTEXT.md` afirmaba que el proyecto usa `better-sqlite3`. **Es incorrecto:**
el `package.json` declara `sqlite3` y el código usa la API de callbacks. Ver
[[DEUDA-deriva-documentacion]].

No se recomienda migrar a `better-sqlite3`: la cola serie ya resuelve el problema que motivaría
el cambio.

## Enlaces

- [[backend-base-de-datos]] · [[S4-sin-versionado-esquema]]
