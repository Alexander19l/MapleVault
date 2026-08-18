---
tags: [modulo, desktop, seguridad, critico]
estado: estable
actualizado: 2026-08-17
---

# Desktop · Electron

**Directorio:** `app/desktop/electron/` · **Main:** `main.ts` (583 líneas)

## Postura de seguridad

Los tres flags críticos están correctos en las **cuatro** ventanas (principal, reproductor,
splash y error): `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
(`main.ts:393-398`, `:87-106`, `launcher.ts:20-25,118-123`). `webSecurity` no se toca en ningún
sitio, así que queda en el default seguro.

La ventana del reproductor —la que carga contenido remoto— corre **sin preload** y en partición
de sesión aparte (`main.ts:99-105`). Popups denegados y navegación externa bloqueada
(`adblock/playerProtection.ts:302-320`).

## Puente IPC

Dos preloads con `contextBridge`; ninguno filtra `ipcRenderer` crudo. Allowlists explícitas:
3 canales de `send` (`preload.ts:44-48`) y 16 de `invoke` (`:51-68`), y los genéricos rechazan lo
no listado (`:182-196`). URLs externas restringidas a `http:`/`https:` (`:34-41`) y lista negra de
25 extensiones peligrosas (`:13-18`).

Hueco de defensa en profundidad: `shell-open-path` y `shell-show-item` validan la extensión solo
en el preload, no en el main → [[S8-shell-open-defensa-superficial]].

## Arranque del backend

Solo en producción (`main.ts:265-295`): `spawn(process.execPath, [backendPath])` con
`ELECTRON_RUN_AS_NODE`. Reserva un puerto libre dinámicamente (`:207-227`), genera un token de
sesión de 32 bytes por arranque (`:56-58`) y un `MAPLEVAULT_INSTANCE_ID` verificado en el
healthcheck (`:362-367`). Ver [[ADR-003-puerto-dinamico-token-sesion]] e
[[INC-005-puerto-5000-empaquetado]].

En desarrollo el backend se lanza aparte y **sin token**, lo que desactiva la autenticación →
[[S2-auth-desactivada-sin-token]].

## Almacenamiento offline

`mangaOfflineStorage.ts` es la superficie real de path traversal, y está contenida: ruta
sanitizada y verificada dentro de la raíz (`:25-43`), máximo 256 MB (`:7`) y 500 páginas (`:6`),
ZIP inválidos rechazados antes de crear carpeta. Ver [[v1.0.18-almacenamiento-testeable]].

## Enlaces

- [[backend-server]] · [[empaquetado-distribucion]] · [[DEUDA-desktop-sin-tests]]
