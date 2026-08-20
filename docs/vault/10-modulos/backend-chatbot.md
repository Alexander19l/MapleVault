---
tags: [modulo, backend, chatbot, seguridad]
estado: estable
actualizado: 2026-08-17
---

# Backend · Maple Assistant

50 archivos. Separa siempre interpretación de ejecución.

```
mensaje → sanitización → intención/entidades → handler local → confirmación → SQLite → auditoría
```

## Principio

Regex local es el comportamiento base. Ollama solo ayuda a interpretar o redactar **a partir de
datos ya verificados**; nunca ejecuta SQL ni acciones protegidas. Toda respuesta con datos sale
de SQLite o de una fuente real.

## Confirmación con token

Implementada correctamente en `chatbot/actionConfirmation.ts`:

- token de `crypto.randomBytes(16)` (`:40`), TTL 5 min (`:20`), uso único con `delete` (`:71`);
- verificación en `actionExecutor.ts:85-103`, que además **valida que el tipo de acción coincida**
  (`:99`) y **sustituye `actionData` por la del token** (`:103`) — el payload confirmado no se
  puede alterar en la llamada de ejecución.

Las 11 acciones de escritura de `actionPolicies.ts:1-13` requieren confirmación, sin excepción.
Ver [[ADR-004-confirmacion-token-chatbot]].

La asimetría está en REST, no aquí: [[S1-clear-sin-confirmacion]].

## Auditoría

Cada ejecución se registra con estado y duración (`actionExecutor.ts:71-78`,
`chatbot/actionAudit.ts`) aplicando `maskSensitiveData`. Tabla `assistant_prompt_runs`.

## Enlaces

- [[backend-seguridad]] · [[backend-base-de-datos]] · [[ADR-004-confirmacion-token-chatbot]]
