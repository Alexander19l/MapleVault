---
tags: [deuda, frontend, dependencias, prioridad-media]
prioridad: media
esfuerzo: bajo
actualizado: 2026-08-17
---

# DEUDA · Zustand declarado y nunca usado

## Hecho

`app/frontend/package.json:29` declara `"zustand": "^5.0.14"`. Un barrido de
`from 'zustand'` en todo `app/frontend/src` devuelve **cero resultados**.

La documentación del proyecto afirma que el frontend usa "Zustand y estado React local según el
componente". La primera mitad no es cierta → [[DEUDA-deriva-documentacion]].

## Qué hay en su lugar

Seis `useState` en `App.tsx:27-33` propagados por props, más `CustomEvent` sobre `window` y un
contador `refreshTrigger` que fuerza refetch completo. Ver
[[ADR-005-sin-router-estado-en-app]].

## Por qué importa

Es una dependencia pagada que no se usa, y a la vez la solución al problema que sí se tiene:
[[DEUDA-sin-cache-ni-abort]] pide una capa de cache y deduplicación, y Zustand la cubre sin
añadir nada nuevo al `package.json`.

## Decisión pendiente

Una de dos, no ambas:

- **Adoptarla** para el estado compartido y la cache de datos, empezando por lo que hoy resuelve
  `refreshTrigger`.
- **Eliminarla** del `package.json` y documentar que el estado es local por diseño.

Mantenerla declarada y muerta es la peor de las tres opciones: sugiere una arquitectura que no
existe.

## Enlaces

- [[frontend-app-estado]] · [[ADR-005-sin-router-estado-en-app]] · [[DEUDA-sin-cache-ni-abort]]
