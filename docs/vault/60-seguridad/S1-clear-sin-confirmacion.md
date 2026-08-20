---
tags: [seguridad, hallazgo, backend, abierto]
severidad: media
confianza: confirmado
actualizado: 2026-08-17
---

# S1 · Operaciones destructivas REST sin confirmación de servidor

**Severidad: media.** Bajada desde "alta" tras trazar el flujo completo — ver *Matices* abajo.

## Flujo

- **Source:** `keepUserList` del body de `POST /anime/clear`, sin schema de tipo.
- **Transformación:** ninguna. `clearCatalogData` compara `keepUserList === false`.
- **Sink:** `DELETE FROM anime / user_list / watched_episodes / anime_genres / anime_relations /
  genres` (rama total) o `DELETE FROM anime WHERE id NOT IN (SELECT anime_id FROM user_list)`
  (rama parcial).

`routes/libraryRoutes.ts:244-262` · `routes/libraryWriteRepository.ts:104-135`

## El patrón se repite

| Ruta | Archivo |
|---|---|
| `POST /anime/clear` | `libraryRoutes.ts:244` |
| `DELETE /anime/:id` | `libraryRoutes.ts:232-242` |
| `DELETE /user-list/:id` | `libraryRoutes.ts:379-389` |
| `POST /backup/restore` | `backupRoutes.ts:76-96` |

Ninguna exige confirmación de servidor. La misma clase de operación **sí** la exige vía chatbot
→ [[ADR-004-confirmacion-token-chatbot]]. Esa es la asimetría.

## Matices que bajan la severidad

- La comparación estricta `=== false` significa que **no hay escalada por confusión de tipos**:
  un string `"false"`, un array o un objeto caen en la rama parcial, no en el borrado total.
- La ruta está detrás de `createSessionAuthMiddleware` (`server.ts:57`).
- El frontend antepone un `showConfirm()` (`Settings.tsx:1506-1508`) — es UI, no servidor, pero
  cubre el uso normal.
- Existen backups automáticos periódicos, así que hay recuperación.
- Quien ya tenga el token puede causar daño equivalente con `DELETE /anime/:id` en bucle.

## Impacto real

Un XSS en el renderer, o un bug de UI que llame a `api.clearCatalog` sin pasar por el modal,
vacía el catálogo en una petición sin ningún control de servidor.

## Corrección

Exigir el mismo flujo de `confirmToken` que ya existe en `chatbot/actionExecutor.ts:85-103` para
las cuatro rutas, y validar `typeof keepUserList === 'boolean'` explícitamente.

## Enlaces

- [[backend-seguridad]] · [[backend-chatbot]] · [[ADR-004-confirmacion-token-chatbot]]
