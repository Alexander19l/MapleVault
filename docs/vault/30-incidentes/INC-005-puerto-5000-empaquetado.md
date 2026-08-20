---
tags: [incidente, desktop, seguridad, resuelto]
actualizado: 2026-08-17
---

# INC-005 · La app empaquetada reutilizaba el puerto de desarrollo

## Síntoma

Una instalación empaquetada podía chocar con un backend de desarrollo abierto en el puerto
`5000`, o hablar con el proceso equivocado.

## Causa

El puerto estaba fijo. Cualquier otro proceso escuchando en `5000` —incluido el backend de
desarrollo del propio proyecto— entraba en conflicto. Y sin identidad de instancia, no había
forma de detectar que se estaba hablando con el servidor equivocado.

## Corrección

Commits `9ef61ede` (*Fix packaged backend network connectivity*) y `c321f8c4` (*Isolate packaged
backend*):

- puerto reservado dinámicamente antes de arrancar (`main.ts:207-227`);
- token de sesión aleatorio de 32 bytes por arranque (`main.ts:56-58`);
- `MAPLEVAULT_INSTANCE_ID` UUID verificado en el healthcheck (`main.ts:362-367`).

Ver [[ADR-003-puerto-dinamico-token-sesion]].

## Regla permanente

Las instancias empaquetadas no deben reutilizar el puerto de desarrollo. Puerto dinámico y token
local, siempre.

## Enlaces

- [[desktop-electron]] · [[ADR-003-puerto-dinamico-token-sesion]] · [[S2-auth-desactivada-sin-token]]
