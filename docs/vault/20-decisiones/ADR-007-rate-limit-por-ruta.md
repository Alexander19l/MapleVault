---
tags: [decision, seguridad, backend]
estado: vigente
actualizado: 2026-08-17
---

# ADR-007 · Rate limit por ruta, sin discriminar cliente

## Contexto

El rate limiter necesita una clave para agrupar contadores. En un servicio web esa clave es la IP
o la sesión. En una app local el "cliente" es siempre la misma máquina.

## Decisión

La clave es `${limitKey}:${req.path}` (`rateLimiter.ts:111`), sin IP ni sesión. Está documentado
en el propio código:

> En app local, el "cliente" es siempre localhost — se usa endpoint como discriminador.

Presets en `:93-102`: `general` 500/min, `scraping` 20/min, `chat` 30/min, `search` 50/10 s.
Store en memoria con limpieza cada 60 s (`:19-29`).

## Consecuencias asumidas

- El límite es **global por ruta**: una pestaña puede agotar la cuota de las demás.
- No aporta defensa DoS multi-cliente, pero eso no aplica a este modelo →
  [[ADR-001-local-first]].
- Su función real es contener bucles accidentales del propio frontend y limitar el ritmo de
  scraping, no defenderse de un atacante.

**Esto no es un defecto.** Se registra como decisión consciente para que una futura auditoría no
lo reporte como hallazgo.

## Lo que sí está pendiente

`scraping` y `search` están definidos pero no cableados a ninguna ruta; solo `general` y `chat`
se aplican → [[S7-rate-limit-presets-sin-cablear]].

## Enlaces

- [[backend-seguridad]] · [[ADR-001-local-first]]
