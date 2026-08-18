---
tags: [modulo, build, distribucion]
estado: estable
actualizado: 2026-08-17
---

# Empaquetado y distribución

**Config:** `electron-builder.json` · **Scripts:** `scripts/`

## Qué entra en el instalador

Solo cuatro entradas (`electron-builder.json:7-12`): `app/frontend/dist/**`, `dist/desktop/**`,
`dist/backend-runtime/**` y `package.json`. `asarUnpack` para `dist/backend-runtime/**`
(`:13-15`), necesario porque `sqlite3` es nativo y coherente con la sustitución de
`app.asar` por `app.asar.unpacked` en `main.ts:268`.

No se empaqueta código fuente TypeScript ni devDependencies.

## Pipeline

`npm run dist:win` = build → `prepare:package-runtime` → `verify:package` → `clean:installer` →
electron-builder.

- `prepare-backend-runtime.js` — stagea el backend, resuelve dependencias de producción con
  `npm ls --omit=dev --all --parseable` y verifica que cada paquete esté bajo
  `app/backend/node_modules` antes de copiarlo (`:50-60`).
- `verify-package-inputs.js` — falla el build si falta alguno de 13 archivos obligatorios, e
  incluye validación de la cabecera binaria del icono.
- `clean-installer-output.js` — borra solo artefactos de instalador, con guardia de ruta
  (`:6-8`), conservando `dist/desktop` y `dist/backend-runtime`.

Los tres scripts de guardia son defensas explícitas contra builds incompletos y borrados fuera
de `dist/`. Es una de las partes mejor cuidadas del proyecto.

## Distribución

El instalador no está firmado; SmartScreen advierte. Debe publicarse un único ejecutable y, por
su tamaño (>100 MiB), mediante GitHub Release, no en el árbol del repositorio →
[[DEUDA-repo-pesado]].

## Enlaces

- [[desktop-electron]] · [[pruebas-y-verificacion]] · [[DEUDA-sin-ci]]
