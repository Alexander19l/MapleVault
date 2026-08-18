---
tags: [decision, manga, producto]
estado: vigente
actualizado: 2026-08-17
---

# ADR-010 · El lector no infiere paneles

## Contexto

Es tentador recortar automáticamente las viñetas de una página para ofrecer lectura panel a panel
en ventanas pequeñas. Varias apps lo hacen con heurísticas de visión.

## Decisión

**No.** El lector representa cada imagen como una página ordenada y nada más. No se implementa
detección de paneles mediante recortes heurísticos.

## Razón

Una heurística que falla no degrada suavemente: rompe la narración. Un recorte mal calculado
parte una viñeta, revela el desenlace antes de tiempo o reordena la lectura. El coste de un
falso positivo es mucho mayor que el beneficio de acertar.

## Puerta abierta

Si en el futuro se implementa visión por computadora, debe ser **opcional y reversible**: el
usuario la activa y puede volver a la página completa en cualquier momento.

## Reparto de responsabilidades

El contrato que sostiene esta decisión:

```
proveedor  → descubre y ordena páginas
router     → seguridad y traducción de la respuesta
lector     → solo presenta imágenes
```

El lector no debe conocer reglas de CDN ni de scraping. El contrato `pages: string[]` es lo que
mantiene esa separación, y hay que preservarlo al tocar el lector.

## Enlaces

- [[backend-manga]] · [[ADR-002-proxy-firmado-paginas]] · [[v1.0.17-lector-paginado]]
