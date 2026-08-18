---
tags: [deuda, mantenibilidad, prioridad-baja]
prioridad: baja
esfuerzo: bajo
actualizado: 2026-08-17
---

# DEUDA · Código y directorios muertos

Inventario de lo que existe pero no se usa. Individualmente son triviales; juntos hacen que el
mapa mental del proyecto no coincida con el código.

| Qué | Dónde | Nota |
|---|---|---|
| `validateSafePath` | `security/validators.ts:376` | Sin llamadores → [[S3-validatesafepath-muerto]] |
| Directorio `downloads/` | `app/backend/src/downloads/` | Vacío; la lógica vive en Electron |
| Directorio `e2e/` | raíz | Vacío; los tests E2E están en `tests/` |
| Dependencia `zustand` | `app/frontend/package.json:29` | Nunca importada → [[DEUDA-zustand-sin-usar]] |
| Presets `scraping` y `search` | `security/rateLimiter.ts:93-102` | Definidos, no cableados → [[S7-rate-limit-presets-sin-cablear]] |
| `@vitest/coverage-v8` | `app/backend/package.json` | Instalado, nunca ejecutado |

## Por qué merece atención pese a ser prioridad baja

Dos de estos elementos están en el módulo de seguridad. Código de seguridad muerto es peor que
ausente: induce a creer que una defensa está activa cuando no lo está.

## Herramienta

`knip` detecta exports, archivos y dependencias sin usar en un solo paso. **Advertencia
importante**: marca como muertos los exports usados dinámicamente (imports por string,
reflexión), así que hay que grepear el símbolo antes de borrar nada. Un informe limpio no es
prueba.

## Enlaces

- [[S3-validatesafepath-muerto]] · [[DEUDA-zustand-sin-usar]] · [[S7-rate-limit-presets-sin-cablear]]
