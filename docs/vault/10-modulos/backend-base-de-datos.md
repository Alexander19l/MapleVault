---
tags: [modulo, backend, datos, critico]
estado: atencion
actualizado: 2026-08-17
---

# Backend · Base de datos

SQLite con el driver `sqlite3` (callbacks). Toda operación pasa por una cola serie.

**Archivo:** `app/backend/src/database/db.ts`

## Configuración

`busyTimeout 10000` (`:17`); `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`
(`:24-26`, replicado en `reopenDatabase` `:75-77`). Ruta desde `DATABASE_PATH` o
`../../../data/database.sqlite` (`:7`).

## Serialización

`enqueueDbOperation` (`:112-120`) serializa todo; `withTransaction` usa `BEGIN IMMEDIATE` con
`AsyncLocalStorage` (`:135-147`). Ver [[ADR-006-cola-serie-sqlite]].

## Parametrización

Las queries usan siempre `params: any[]` (`:124-132`). Las interpolaciones que existen son de
**estructura**, no de valores, y están acotadas por allowlist:

- `episodeRepository.ts:41,53,62` interpola `${slugColumn}` tras `assertValidSlugColumn` contra un
  `Set` de 4 columnas (`:7-18`).
- `mangaRepository.ts:98` interpola `ORDER BY ${sortSql}` desde un `switch` cerrado (`:30-34`).
- `librarySummaryRepository.ts` interpola `nonAdultCondition`, constante sin entrada de usuario.

Única concatenación con variable: `db.ts:176-177`, `VACUUM INTO '${escapedEmergencyPath}'`. La
ruta la genera el servidor, no el usuario, y hay escapado de comilla simple.

## Migraciones

**No hay versionado.** `initDb()` (`:247`) hace `CREATE TABLE IF NOT EXISTS` y luego
`ALTER TABLE … ADD COLUMN` en `try/catch` vacíos (`:283-321`) → [[S4-sin-versionado-esquema]].

## Enlaces

- [[backend-server]] · [[ADR-006-cola-serie-sqlite]] · [[S4-sin-versionado-esquema]]
