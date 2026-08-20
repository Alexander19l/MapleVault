---
tags: [decision, manga, contrato]
estado: vigente
actualizado: 2026-08-17
---

# ADR-008 · Idiomas de manga restringidos y normalización de es-la

## Contexto

MangaDex expone capítulos en decenas de idiomas. Mezclarlos sin criterio produce una lista de
capítulos duplicada e ilegible, con el mismo número repetido en cinco idiomas.

## Decisión

Solo se aceptan tres idiomas: `es`, `es-la` y `en`. En el contrato hacia el frontend, `es-la` se
**normaliza a `es`**, de modo que el cliente maneja dos valores y no tres.

Los filtros de MangaDex reciben `includedTags[]` con **IDs oficiales** obtenidos de `/manga/tag`,
`includedTagsMode=AND` y `status[]`. Nunca se envían nombres libres escritos por el usuario.

El frontend limita a cuatro géneros y cuatro temas para evitar URLs excesivas y combinaciones que
devuelvan cero resultados por accidente.

## Regla de cambio

Si en el futuro se requieren otros idiomas, hay que cambiar **explícitamente** la política, el
frontend y los tests. No se debe eliminar el filtro en silencio: la lista de capítulos es el
contrato que sostiene el lector.

## Límite de las fuentes secundarias

ZonaTMO y ShadeManga son HTML y pueden no soportar filtros. En ese caso la UI debe **comunicar la
limitación** y mantener la búsqueda por título, en vez de fingir que filtra.

## Enlaces

- [[backend-manga]] · [[v1.0.16-filtros-biblioteca-offline]] · [[v1.0.19-lector-online-feed-sinopsis]]
