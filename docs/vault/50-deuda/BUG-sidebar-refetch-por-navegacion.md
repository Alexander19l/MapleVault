---
tags: [bug, frontend, rendimiento, prioridad-media]
prioridad: media
esfuerzo: bajo
actualizado: 2026-08-17
---

# BUG · Sidebar pide /settings/ai en cada navegación

## Hecho

`components/layout/Sidebar.tsx:28-30` declara `useEffect(..., [activePage])`, de modo que
`checkConnectionStatus()` se dispara cada vez que el usuario cambia de página.

El resultado solo se usa para pintar un punto de estado de conexión.

## Por qué es un síntoma, no solo un bug

Es el ejemplo más claro de lo que cuesta no tener cache: un dato que cambia rara vez se vuelve a
pedir en cada navegación porque no hay dónde guardarlo →
[[DEUDA-sin-cache-ni-abort]].

## Corrección

Consultar una vez al montar y refrescar con un intervalo largo, o mover el estado de conexión a
la store compartida.

## Enlaces

- [[DEUDA-sin-cache-ni-abort]] · [[DEUDA-waterfalls]] · [[frontend-app-estado]]
