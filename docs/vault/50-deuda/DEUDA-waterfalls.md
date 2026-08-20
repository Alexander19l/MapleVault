---
tags: [deuda, frontend, rendimiento, prioridad-alta]
prioridad: alta
esfuerzo: bajo
actualizado: 2026-08-17
---

# DEUDA · Peticiones secuenciales que podrían ser paralelas

## El caso principal

`AdvancedSearch.tsx:85-111` ejecuta la búsqueda local, la espera con `await`/`finally`, y
**después** lanza la búsqueda online. Son independientes.

Con `Promise.all` el tiempo pasa de `local + online` a `max(local, online)`. Es el arreglo de
mejor ratio impacto/esfuerzo de todo el frontend: una línea.

## Los demás

| Sitio | Problema |
|---|---|
| `Mylist.tsx:44-56` | `getUserList(filtro)` y luego `getUserList()` para estadísticas, secuenciales → [[BUG-mylist-peticion-duplicada]] |
| `Settings.tsx:228-249` | `getSettings()` → … → `getAISettings()` en cadena |
| `Settings.tsx:172-180` | 7 loaders en el mismo `useEffect`, paralelos de hecho pero sin manejo agregado de error ni de carga |
| `Sidebar.tsx:28-30` | Refetch en cada navegación → [[BUG-sidebar-refetch-por-navegacion]] |

## Lo que ya está bien

No es un problema generalizado. Estos sitios sí paralelizan correctamente: `Home.tsx:47-50`,
`Scraping.tsx:42,69`, `Manga.tsx:143,225,253` (con `allSettled`, que además tolera fuentes
caídas), `Seasons.tsx:151`, `AnimeDetailModal.tsx:150`.

El patrón correcto ya existe en el código; solo falta aplicarlo en los cuatro sitios que faltan.

## Enlaces

- [[frontend-capa-datos]] · [[DEUDA-sin-cache-ni-abort]]
