---
tags: [modulo, frontend, estado]
estado: atencion
actualizado: 2026-08-17
---

# Frontend · App y estado global

**Archivo:** `app/frontend/src/App.tsx`

## No hay router

La navegación es un `switch(activePage)` (`App.tsx:105-162`). 12 rutas lógicas sobre 8 páginas:
`favorites` y `pending` reusan `Mylist` con `initialTab`; `adults` reusa `Catalog` con
`isAdultsOnly`. Ver [[ADR-005-sin-router-estado-en-app]].

Sí hay code splitting completo: las 8 páginas más `ChatPanel`, `AnimeDetailModal` y
`AdvancedSearch` son `lazy()` (`App.tsx:7-17`).

## El estado global son 6 useState

`activePage`, `selectedAnimeId`, `selectedExternalAnime`, `refreshTrigger`, `chatOpen`,
`searchValue` (`App.tsx:27-33`), propagados por props.

La comunicación transversal usa `CustomEvent` sobre `window`, no contexto: `utils/notify.ts:10-12`
emite `maplevault:toast`; `App.tsx:46-47` escucha `openAnimeDetail` y `maplevault:data-changed`.

`refreshTrigger` es un contador que fuerza refetch completo por prop — una invalidación de cache
artesanal sin granularidad.

**Zustand está declarado en `package.json` y nunca se importa** → [[DEUDA-zustand-sin-usar]].

## Bug conocido

`searchValue` llega hasta el `input` de `Topbar` pero ninguna página lo recibe →
[[BUG-busqueda-superior-inerte]].

## Enlaces

- [[frontend-capa-datos]] · [[frontend-sistema-diseno]] · [[DEUDA-componentes-gigantes]]
