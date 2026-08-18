---
tags: [seguridad, hallazgo, backend, abierto]
severidad: baja
confianza: confirmado
actualizado: 2026-08-17
---

# S3 · validateSafePath es código muerto

**Severidad: baja.** No hay vulnerabilidad; hay una defensa que aparenta estar conectada y no lo
está.

## Hecho

`security/validators.ts:376` define `validateSafePath(inputPath, allowedBase)`. Un barrido de
todo `app/backend/src` encuentra **solo la definición y su test**. Ningún llamador productivo.

## Por qué existe

Probablemente es un resto de un diseño previo en el que `downloads/` escribía a disco. Ese
directorio (`app/backend/src/downloads/`) **está vacío**: es huérfano.

La escritura real de descargas vive en Electron (`main.ts:513-517`), y allí la contención de
rutas está implementada aparte en `mangaOfflineStorage.ts:25-43`, con sanitizado, verificación de
que el destino queda bajo la raíz, y límites de 256 MB y 500 páginas.

Es decir: **la validación existe donde hace falta**, solo que duplicada e independiente de la del
backend.

## El riesgo

Una futura ruta que escriba a disco puede asumir que `validateSafePath` la protege por estar en
`security/`, sin comprobar que nadie la llama. Código de seguridad muerto es peor que ausente
porque induce confianza falsa.

## Corrección

Una de dos, no ambas: eliminar la función y el directorio vacío `downloads/`, o conectarla como
la validación canónica y hacer que `mangaOfflineStorage.ts` la use.

## Enlaces

- [[backend-seguridad]] · [[desktop-electron]] · [[DEUDA-codigo-muerto]]
