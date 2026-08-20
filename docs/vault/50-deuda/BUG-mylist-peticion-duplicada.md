---
tags: [bug, frontend, rendimiento, prioridad-media]
prioridad: media
esfuerzo: bajo
actualizado: 2026-08-17
---

# BUG · Mylist duplica una petición en la pestaña "all"

## Hecho

`pages/Mylist.tsx:44-56` hace dos llamadas secuenciales:

1. `getUserList(filtro)` para la lista mostrada.
2. `await api.getUserList()` sin filtro, para calcular estadísticas.

En la pestaña `all` (`:47-48`) el filtro está vacío, así que **son exactamente la misma
petición**, ejecutada dos veces y en serie.

## Corrección

Calcular las estadísticas a partir del resultado ya obtenido cuando el filtro está vacío, y
paralelizar con `Promise.all` cuando no lo está.

## Enlaces

- [[DEUDA-waterfalls]] · [[frontend-capa-datos]]
