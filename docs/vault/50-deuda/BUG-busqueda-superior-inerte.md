---
tags: [bug, frontend, prioridad-alta]
prioridad: alta
esfuerzo: bajo
actualizado: 2026-08-17
---

# BUG · La barra de búsqueda superior no filtra nada

**Teclear en la barra de búsqueda del encabezado no tiene ningún efecto.**

## Cadena rota

| Paso | Archivo | Estado |
|---|---|---|
| Se crea el estado | `App.tsx:33` | OK |
| Se pasa a `AppShell` | `App.tsx:169` | OK |
| `AppShell` lo reenvía a `Topbar` | `AppShell.tsx:43` | OK |
| `Topbar` lo pinta en el `input` | `Topbar.tsx:52` | OK |
| **Alguna página lo recibe** | `App.tsx:111-115` | **No ocurre** |

`Catalog.tsx:34-35` mantiene su propio `searchQuery` independiente, así que la búsqueda de la
página funciona — pero la del encabezado escribe en un estado que nadie lee.

## Causa

Consecuencia directa de propagar estado por props sin router ni store: el valor llegó al
componente que lo *muestra* pero no al que lo *usa*. Ver [[ADR-005-sin-router-estado-en-app]].

## Corrección

Pasar `searchValue` a `Catalog` en `App.tsx:111-115` y consumirlo allí, o —mejor— mover la
búsqueda a la store compartida junto con el resto del estado global.

## Enlaces

- [[frontend-app-estado]] · [[ADR-005-sin-router-estado-en-app]] · [[DEUDA-zustand-sin-usar]]
