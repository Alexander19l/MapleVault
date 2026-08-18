---
tags: [deuda, frontend, rendimiento, prioridad-baja]
prioridad: baja
esfuerzo: medio
actualizado: 2026-08-17
---

# DEUDA · Sin virtualización en listados largos

## Hecho

Un barrido de `virtual|react-window` en `app/frontend/src` devuelve **cero resultados**. Ningún
listado está virtualizado.

Listados potencialmente largos:

- `Catalog.tsx:499` — `animes.map` con scroll infinito **acumulativo** vía `IntersectionObserver`
  (`:118-131`). Cada página cargada se suma al DOM y nunca se descarta.
- `Seasons.tsx:262`, `Mylist.tsx:249`.
- `AnimeDetailModal.tsx:789` — lista de episodios.

`AnimeCard.tsx` (306 líneas) se renderiza en bucle en tres páginas y **no está envuelto en
`React.memo`**, mientras que la capa assistant-ui sí memoiza cuatro componentes.

## Mitigaciones existentes

`loading="lazy"` en imágenes (`AnimeCard.tsx:73,187`, `AdvancedSearch.tsx:381`,
`Manga.tsx:526,552,656`) y un `.slice(0,12)` en `Settings.tsx:1274`. La carga de imágenes está
contenida; el coste es el DOM y los re-renders.

## Por qué es prioridad baja

Ninguna medición demuestra todavía que duela. Una biblioteca personal de anime rara vez llega a
los miles de elementos donde la virtualización se vuelve necesaria.

**No añadir `react-window` sin medir primero.** El orden correcto es: medir con el catálogo más
grande que tenga el usuario, y solo entonces decidir. Antes de virtualizar, probar
`React.memo` en `AnimeCard`, que es más barato y probablemente suficiente.

## Enlaces

- [[frontend-sistema-diseno]] · [[DEUDA-componentes-gigantes]]
