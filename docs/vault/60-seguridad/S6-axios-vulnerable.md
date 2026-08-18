---
tags: [seguridad, hallazgo, dependencias, abierto]
severidad: media
confianza: confirmado
actualizado: 2026-08-17
---

# S6 · Dependencias vulnerables, axios como directa

**Severidad: media.** Medido con `npm audit` el 2026-08-17 en las tres raíces.

## Resumen

| Raíz | Total | Crítica | Alta | Otras |
|---|---:|---:|---:|---:|
| `/` | 8 | 1 | 6 | 1 moderada |
| `app/backend` | 7 | 1 | 5 | 1 baja |
| `app/frontend` | 4 | 0 | 4 | 0 |

## Lo que importa

**`axios` es dependencia DIRECTA y vulnerable (alta) en las tres raíces** (rango afectado
`1.0.0 - 1.17.0`). Es la única directa, y está en el camino real de datos: scraping en el backend
y todas las llamadas del frontend (`services/api.ts`).

El resto son **transitivas de la cadena de build**, no de ejecución:

- `tar` (crítica) — vía `node-gyp`, compilación de `sqlite3`.
- `undici`, `brace-expansion`, `fast-uri`, `js-yaml`, `shell-quote` — herramientas de build.
- `nanoid`, `postcss` — cadena de Vite.

## Prioridad

Actualizar `axios` primero y por separado, con verificación propia: es la única que un atacante
podría alcanzar en tiempo de ejecución, y subirla puede afectar al scraping, que depende de
detalles de redirects, timeouts e interceptores.

Las transitivas de build tienen impacto real menor en una app de escritorio empaquetada, donde el
build ocurre en la máquina del desarrollador.

## No aplicado

No se ejecutó `npm audit fix` ni se modificó ningún lockfile. Requiere decisión y verificación
propia.

## Enlaces

- [[empaquetado-distribucion]] · [[DEUDA-sin-ci]]
