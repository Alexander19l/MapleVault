---
tags: [deuda, frontend, prioridad-media]
prioridad: media
esfuerzo: medio
actualizado: 2026-08-17
---

# DEUDA · Errores tragados y alertas bloqueantes en el frontend

## Dos problemas que se refuerzan

### 1. 67 errores tragados

`console.error` seguido de nada, repartidos por todo `src/`: 14 en `Settings.tsx`, 13 en
`AnimeDetailModal.tsx`, el resto disperso. El usuario no ve nada; la operación falla en
silencio.

Solo hay estado de error visible en la UI en cuatro sitios: `AnimeDetailModal.tsx:80` y
`Settings.tsx:70,76,132`.

### 2. Nueve `window.alert()` bloqueantes

`Catalog.tsx:236`, `Mylist.tsx:118`, `Seasons.tsx:154`, `Settings.tsx:203,207,217,220,456`,
`AnimeDetailModal.tsx:380`.

Bloquean el hilo, no son estilizables, rompen la dirección visual y conviven con un **sistema de
toasts que ya existe** (`utils/notify.ts`).

## La incoherencia

El proyecto tiene la infraestructura para hacerlo bien —toasts propios— y no la usa en los dos
extremos: ni para los errores que se tragan, ni para los avisos que interrumpen.

## Corrección

Sustituir los `alert()` por toasts, y convertir los `console.error` mudos en un toast de error
más un registro. No hace falta cubrir los 67 de golpe: empezar por los que siguen a una acción
del usuario, que son los que dejan la interfaz mintiendo.

## Relación con el backend

El mismo patrón existe en tres rutas del backend → [[S5-errores-silenciados-rutas]].

## Enlaces

- [[frontend-capa-datos]] · [[S5-errores-silenciados-rutas]]
