---
tags: [modulo, frontend, datos]
estado: atencion
actualizado: 2026-08-17
---

# Frontend · Capa de datos

**Archivo:** `app/frontend/src/services/api.ts` (590 líneas, ~75 métodos)

## Lo que está bien

Cliente axios único (`:23-28`); cero llamadas `axios.*` sueltas fuera de este archivo. El
interceptor de request inyecta `baseURL` y la cabecera `X-MapleVault-Token` en Electron
(`:46-55`), que es como el renderer usa el token de sesión sin verlo nunca en el bundle.

## Lo que falta

- **Sin cache, sin deduplicación, sin `AbortController`.** La única mitigación de condiciones de
  carrera es un patrón *request-id* manual en `AnimeDetailModal.tsx:81,213,235` y
  `MangaReader.tsx:113,123,127` → [[DEUDA-sin-cache-ni-abort]].
- Retornos mayoritariamente `any`: el contrato de `types.ts` no llega a la capa de red.
- 67 `console.error` que se tragan el error, y 9 `window.alert()` bloqueantes conviviendo con el
  sistema de toasts que ya existe → [[DEUDA-errores-silenciados-frontend]].

## Waterfalls

`AdvancedSearch.tsx:85-111` ejecuta la búsqueda local y la online en secuencia siendo
independientes — el arreglo de mejor ratio impacto/esfuerzo del frontend. Ver
[[DEUDA-waterfalls]].

Bien resueltos en paralelo: `Home.tsx:47-50`, `Scraping.tsx:42,69`, `Manga.tsx:143,225,253`
(con `allSettled`), `AnimeDetailModal.tsx:150`.

## Enlaces

- [[frontend-app-estado]] · [[backend-server]] · [[BUG-mylist-peticion-duplicada]]
