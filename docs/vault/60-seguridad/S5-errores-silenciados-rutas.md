---
tags: [seguridad, hallazgo, backend, abierto]
severidad: media
confianza: confirmado
actualizado: 2026-08-17
---

# S5 · Errores silenciados en rutas y ausencia de handler global

**Severidad: media.**

## Dos problemas relacionados

### 1. `catch (_)` que descarta el error

`routes/assistantRoutes.ts:91,108` y `routes/libraryRoutes.ts:312`:

```
} catch (_) {
  res.status(500).json({ error: 'Error al ejecutar la accion.' });
}
```

El error real nunca se inspecciona ni se registra antes de responder. El resto del router sí usa
`getErrorMessage` y registra — es una inconsistencia, no un patrón deliberado.

Lo grave es **dónde** ocurre: `assistantRoutes.ts:108` envuelve la ejecución de acciones del
chatbot. Un `confirmToken` válido que falle a mitad de una transacción desaparece sin rastro.

`chatbot/actionExecutor.ts:108-111` sí registra con `console.error`, `logBotAction` y
`auditActionExecution`, así que la auditoría de acciones está cubierta; el hueco es la capa HTTP
que las envuelve.

### 2. Sin middleware global de errores ni handler 404

`server.ts` no define `app.use((err, req, res, next) => …)` ni un handler 404. Un `throw` fuera de
try/catch devuelve el stack por defecto de Express. El impacto real es bajo porque casi todos los
handlers ya envuelven en try/catch, pero es la red de seguridad que falta.

## Falsos positivos descartados

- `catch (_) {}` en `episodeRoutes.ts:137` — es caché de slug; si falla se reintenta. Sin impacto.
- `catch (_) { return []; }` en `backup.ts:161-163` — listado de solo lectura para la UI.

## Corrección

Sustituir los tres `catch (_)` por `catch (error)` con registro, reutilizando `getErrorMessage`.
Añadir handler de errores y 404 al final de `server.ts:70`.

## Enlaces

- [[backend-server]] · [[backend-chatbot]] · [[DEUDA-errores-silenciados-frontend]]
