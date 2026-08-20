---
tags: [deuda, frontend, mantenibilidad, prioridad-media]
prioridad: media
esfuerzo: alto
actualizado: 2026-08-17
---

# DEUDA · Componentes demasiado grandes

## Los cinco mayores

| Archivo | Líneas |
|---|---:|
| `pages/Settings.tsx` | **1540** |
| `components/AnimeDetailModal.tsx` | **1039** |
| `pages/Catalog.tsx` | 697 |
| `pages/Manga.tsx` | 688 |
| `components/chatbot/MapleToolCall.tsx` | 639 |

15 archivos superan las 300 líneas, incluidos `services/api.ts` (590), `MangaReader.tsx` (501),
`AdvancedSearch.tsx` (475) y `types.ts` (429).

## El candidato claro

`Settings.tsx` es un contenedor de ~8 secciones independientes (ajustes generales, IA, historial
de acciones, arranque, backups, transferencia de datos, traducción, mangas descargados). Cada una
tiene su propio estado, sus loaders y su manejo de errores.

Los síntomas ya se notan ahí: 14 `console.error` mudos, 5 de los 9 `window.alert()`, un
`useEffect` con lista de dependencias incompleta (`:172-186`) y 7 loaders sin coordinación.

## Propuesta

Dividir `Settings.tsx` por sección, una por archivo, con la página como contenedor de pestañas.
Es un refactor mecánico y de riesgo bajo si se hace sección a sección verificando entre pasos.

`AnimeDetailModal.tsx` es el siguiente, pero tiene más lógica entrelazada (request-id manual,
episodios, traducción) y merece hacerse después.

## Enlaces

- [[frontend-app-estado]] · [[DEUDA-errores-silenciados-frontend]] · [[DEUDA-tests-frontend-ausentes]]
