---
tags: [deuda, desktop, pruebas, seguridad, prioridad-media]
prioridad: media
esfuerzo: medio
actualizado: 2026-08-17
---

# DEUDA · La capa Electron casi no tiene tests

## Estado

| Archivo | Líneas aprox. | ¿Tests? |
|---|---:|---|
| `mangaOfflineStorage.ts` | — | Sí, desde vitest del backend |
| `playerRequest.ts` | — | Sí |
| `main.ts` | 583 | **No** |
| `preload.ts` | — | **No** |
| `launcher.ts` | — | **No** |
| `adblock/*` | — | **No** |

## Por qué preocupa más que en otras capas

Ahí vive la superficie de seguridad más sensible del proyecto: las allowlists de canales IPC
(`preload.ts:44-68`), la validación de extensiones peligrosas (`:13-18`), la resolución de URL
del reproductor y los `webPreferences` de las cuatro ventanas.

Una regresión en `preload.ts` —añadir un canal a la allowlist, o quitar una validación— no la
detectaría nada. Y `launcher.ts` ya tiene un fallo real sin cobertura →
[[BUG-ruta-datos-dependiente-layout]].

## El patrón a repetir ya existe

[[v1.0.18-almacenamiento-testeable]] hizo justo esto: extraer la lógica de `main.ts` a un módulo
puro (`mangaOfflineStorage.ts`) para poder probarla desde vitest, sin cambiar el contrato del
preload ni de React.

La misma técnica aplica a la validación de canales, la de rutas de `launcher.ts` y la de URL del
reproductor: sacar la función pura, dejar en `main.ts` solo el cableado de Electron.

## Enlaces

- [[desktop-electron]] · [[v1.0.18-almacenamiento-testeable]] · [[S8-shell-open-defensa-superficial]]
