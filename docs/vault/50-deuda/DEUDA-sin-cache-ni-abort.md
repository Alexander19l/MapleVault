---
tags: [deuda, frontend, rendimiento, prioridad-alta]
prioridad: alta
esfuerzo: medio
actualizado: 2026-08-17
---

# DEUDA · Sin cache, deduplicación ni AbortController

## Hecho

`services/api.ts` (590 líneas, ~75 métodos) no tiene cache, ni deduplicación de peticiones en
vuelo, ni cancelación. Un barrido de `AbortController|signal` en todo `src/` devuelve cero.

La única mitigación de condiciones de carrera es un patrón *request-id* manual en
`AnimeDetailModal.tsx:81,213,235` y `MangaReader.tsx:113,123,127` — resuelto a mano en dos
sitios, ausente en el resto.

## Consecuencias

- Navegar `home → catalog → home` vuelve a descargar todo.
- `Sidebar.tsx:28-30` pide `/settings/ai` en **cada navegación** solo para pintar un punto de
  estado → [[BUG-sidebar-refetch-por-navegacion]].
- Al teclear en una búsqueda, las respuestas antiguas pueden llegar después de las nuevas.
- `refreshTrigger` invalida todo de golpe porque no hay granularidad.

## Por qué no se ha notado

Es una app Electron contra un backend local: la latencia es de milisegundos y el coste percibido
es bajo. Eso explica que nunca doliera lo suficiente para arreglarlo.

Pero el propio roadmap del proyecto ya pedía `AbortController` en búsquedas y carga de recientes,
así que el problema estaba identificado desde antes.

## Propuesta

Zustand ya está en el `package.json` sin usar → [[DEUDA-zustand-sin-usar]]. Una store de cache
con TTL corto y cancelación por clave cubre los tres problemas sin añadir dependencias.

Empezar por: cancelación en búsqueda, cache del endpoint de `Sidebar`, y sustituir
`refreshTrigger` por invalidación selectiva.

## Enlaces

- [[frontend-capa-datos]] · [[DEUDA-zustand-sin-usar]] · [[DEUDA-waterfalls]]
