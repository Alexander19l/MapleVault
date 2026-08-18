---
tags: [decision, seguridad, chatbot]
estado: vigente
actualizado: 2026-08-17
---

# ADR-004 · Toda escritura del asistente requiere token de confirmación

## Contexto

El chatbot interpreta lenguaje natural. Si una interpretación errónea pudiera ejecutar
directamente un borrado, un malentendido costaría datos del usuario.

## Decisión

Interpretación y ejecución están separadas por un token de un solo uso.

```
mensaje → sanitización → intención → handler → CONFIRMACIÓN → acción SQLite → auditoría
```

`chatbot/actionConfirmation.ts`: token de `crypto.randomBytes(16)` (`:40`), TTL 5 minutos
(`:20`), borrado tras consumir (`:71`), limpieza periódica (`:23-30`).

Dos protecciones que suelen faltar en implementaciones parecidas y aquí sí están
(`actionExecutor.ts:85-103`):

- se **valida que el tipo de acción coincida** con el registrado (`:99`);
- se **sustituye `actionData` por la del token** (`:103`), de modo que el payload confirmado no
  puede alterarse en la llamada de ejecución.

Las 11 acciones de escritura de `actionPolicies.ts:1-13` requieren confirmación sin excepción.

## Límite conocido

Esta garantía cubre la ruta del chatbot. La misma operación destructiva expuesta como REST
directo **no** exige confirmación → [[S1-clear-sin-confirmacion]]. Es la asimetría a corregir.

## Enlaces

- [[backend-chatbot]] · [[backend-seguridad]] · [[S1-clear-sin-confirmacion]]
