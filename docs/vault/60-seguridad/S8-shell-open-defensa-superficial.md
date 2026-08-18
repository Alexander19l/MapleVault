---
tags: [seguridad, hallazgo, desktop, abierto]
severidad: baja
confianza: confirmado
actualizado: 2026-08-17
---

# S8 · shell-open-path valida la extensión solo en el preload

**Severidad: baja.** Es un hueco de defensa en profundidad, no una vía explotable hoy.

## Hecho

`preload.ts:13-18` define una lista negra de 25 extensiones peligrosas y la aplica en
`openPath` / `showItemInFolder` (`:162-179`).

Los handlers del proceso principal, `shell-open-path` (`main.ts:549`) y `shell-show-item`
(`:557`), solo comprueban que el argumento sea string y `path.isAbsolute`. **No revalidan la
extensión.**

## Por qué el riesgo es bajo

El renderer no tiene acceso a `ipcRenderer` crudo: `contextBridge` expone únicamente la API
filtrada, y los métodos genéricos `send`/`invoke` rechazan cualquier canal fuera de las
allowlists (`preload.ts:182-196`). Con `contextIsolation: true` y `sandbox: true` en las cuatro
ventanas, un renderer comprometido no puede saltarse el preload.

Es decir: la validación está exactamente en el sitio por el que hay que pasar. El problema es que
es la **única** capa.

## Por qué corregirlo igualmente

El preload es código que corre en el proceso de renderizado. La regla de Electron es que el main
no confíe en lo que le llega del renderer, aunque hoy solo pueda llegar del preload. Duplicar la
comprobación en `main.ts` cuesta tres líneas.

Lo mismo aplica a `adblock-toggle` (`playerProtection.ts:357`), que asigna `enabled` sin
coerción a booleano.

## Enlaces

- [[desktop-electron]] · [[ADR-001-local-first]]
