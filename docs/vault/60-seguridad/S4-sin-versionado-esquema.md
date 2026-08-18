---
tags: [seguridad, hallazgo, datos, abierto]
severidad: media
confianza: confirmado
actualizado: 2026-08-17
---

# S4 · Sin versionado de esquema de base de datos

**Severidad: media.** Es un riesgo de integridad de datos, no de seguridad en sentido estricto.

## El problema

`database/db.ts:247` — `initDb()` crea ~18 tablas con `CREATE TABLE IF NOT EXISTS` y después
aplica cambios con `ALTER TABLE … ADD COLUMN` envueltos en `try/catch` vacíos (`:283-321`,
`:417-421`, `:462`). El comentario del catch es literalmente *"La columna ya existe"*.

No existe `PRAGMA user_version`, ni tabla de migraciones, ni ningún registro de qué versión de
esquema tiene una base de datos concreta.

## Por qué importa

1. **Cualquier error de `ALTER` se traga en silencio**, no solo "columna duplicada". Un disco
   lleno, un bloqueo o un tipo inválido pasan inadvertidos y dejan el esquema a medias.
2. No se puede saber si una base restaurada desde backup tiene el esquema esperado.
3. Las migraciones no son reversibles, lo que contradice la regla del propio proyecto: *"Todo
   cambio de esquema debe tener migración reversible"*.

## Corrección propuesta

Usar `PRAGMA user_version`, que SQLite ya ofrece y **no requiere ninguna dependencia**:

1. Leer `user_version` al abrir.
2. Aplicar en orden solo las migraciones con número superior, cada una en su transacción.
3. Escribir el nuevo `user_version` al terminar.
4. Que un fallo de migración aborte el arranque en vez de continuar con esquema parcial.

El `enqueueDbOperation` y `withTransaction` que ya existen dan la serialización necesaria →
[[ADR-006-cola-serie-sqlite]].

## Enlaces

- [[backend-base-de-datos]] · [[ADR-006-cola-serie-sqlite]]
