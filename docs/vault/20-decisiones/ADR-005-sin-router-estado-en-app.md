---
tags: [decision, frontend, arquitectura]
estado: revisar
actualizado: 2026-08-17
---

# ADR-005 · Sin router, estado global en App.tsx

## Contexto

La aplicación tiene 8 páginas y 12 rutas lógicas. Al ser Electron, no hay URLs que compartir ni
deep links externos, así que un router aporta menos que en una web.

## Decisión

No se usa `react-router`. La navegación es un `switch(activePage)` en `App.tsx:105-162` y el
estado compartido son 6 `useState` (`App.tsx:27-33`) propagados por props, más `CustomEvent`
sobre `window` para lo transversal.

Zustand se añadió al `package.json` previendo este crecimiento, pero **nunca se llegó a usar**.

## Consecuencias

**A favor:** cero dependencia de router, code splitting explícito y sencillo, y el flujo de datos
es rastreable leyendo un solo archivo.

**En contra, ya visibles:**

- `refreshTrigger` es un contador que fuerza refetch completo — invalidación sin granularidad.
- El paso de props entre `App` → `AppShell` → `Topbar` es donde se perdió `searchValue`
  → [[BUG-busqueda-superior-inerte]].
- No hay historial de navegación ni "atrás".
- La comunicación por eventos `window` no es tipada ni rastreable por el compilador.

## Revisión pendiente

O se adopta Zustand (ya está pagado en el `package.json`) o se elimina la dependencia. Mantenerla
declarada y sin usar es la peor de las tres opciones → [[DEUDA-zustand-sin-usar]].

## Enlaces

- [[frontend-app-estado]] · [[DEUDA-sin-cache-ni-abort]]
