---
tags: [decision, seguridad, desktop]
estado: vigente
actualizado: 2026-08-17
---

# ADR-003 · Puerto dinámico y token de sesión por arranque

## Contexto

Una instancia empaquetada que reutilizara el puerto de desarrollo `5000` podía chocar con un
backend de desarrollo abierto, o permitir que otra aplicación local hablara con la API.
Ver [[INC-005-puerto-5000-empaquetado]].

## Decisión

En producción, Electron:

1. Reserva un **puerto libre dinámicamente** con `net.createServer().listen(0, host)`
   (`main.ts:207-227`), antes de arrancar nada.
2. Genera un **token de sesión** de 32 bytes por arranque, `crypto.randomBytes(32)`
   (`main.ts:56-58`), y lo pasa al backend como `MAPLEVAULT_API_TOKEN` (`:277`).
3. Genera un `MAPLEVAULT_INSTANCE_ID` UUID verificado en el healthcheck (`:55,278,362-367`).

El renderer recibe el token **solo por IPC** (`main.ts:485-488`), nunca queda en el bundle. El
cliente axios lo inyecta como `X-MapleVault-Token` (`services/api.ts:46-55`).

La comparación en el backend usa `crypto.timingSafeEqual` con chequeo previo de longitud
(`sessionAuth.ts:6-10`).

## Consecuencia aceptada

En **desarrollo** el backend se lanza aparte, sin esas variables de entorno, así que
`sessionAuth.ts:16` deja pasar todo. La API local queda sin autenticación en modo dev por
diseño. El riesgo se contiene con el bind a `127.0.0.1`, no con el token.
Ver [[S2-auth-desactivada-sin-token]].

## Enlaces

- [[desktop-electron]] · [[backend-seguridad]] · [[ADR-001-local-first]]
