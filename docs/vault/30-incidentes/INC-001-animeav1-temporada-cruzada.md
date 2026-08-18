---
tags: [incidente, scraping, resuelto]
actualizado: 2026-08-17
---

# INC-001 · AnimeAV1 devolvía episodios de otra temporada

## Síntoma

La fuente devolvía capítulos pertenecientes a otra temporada de la misma franquicia, o a obras
relacionadas, presentándolos como episodios de la serie solicitada.

## Causa

Coincidencia por texto parcial del título. Dos temporadas de una misma franquicia comparten
buena parte del nombre, así que una coincidencia laxa las confunde.

## Corrección

La asociación pasó a basarse en **identidad de temporada y coincidencia estricta**. Se valida
título, año, temporada, slug e identidad de proveedor antes de aceptar un episodio.

Commits relacionados: `4c288314` (prevent cross-season matches), `895e2e89`, `37533ba6`,
`e37da030` (validate episode associations).

## Regla permanente

**Nunca aceptar un episodio solo porque coincida parcialmente por texto.** Las coincidencias
ambiguas se descartan o exigen validación adicional. Es preferible no mostrar un episodio que
mostrar el equivocado.

Esta regla aplica igual a los proveedores de manga: descartar capítulos sin identidad confiable.

## Enlaces

- [[backend-scraping-anime]] · [[INC-002-urls-invalidas-fuentes]]
