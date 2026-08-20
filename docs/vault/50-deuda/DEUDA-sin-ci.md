---
tags: [deuda, pruebas, prioridad-alta]
prioridad: alta
esfuerzo: bajo
actualizado: 2026-08-17
---

# DEUDA · No existe integración continua

**La mejora de mayor retorno del proyecto.** Prioridad alta, esfuerzo bajo.

## Hecho

No hay `.github/` ni ningún otro sistema de CI. Toda verificación es manual: alguien tiene que
acordarse de ejecutar `npm run check` antes de publicar.

Lo llamativo es que `playwright.config.ts:20-24` **ya condiciona** `forbidOnly`, `retries` y
`workers` a `process.env.CI`. La configuración está escrita para un CI que nunca se creó.

## Por qué duele aquí en concreto

- Hay 84 archivos de test de backend que solo aportan valor si alguien los ejecuta.
- El proyecto es de un solo desarrollador: no hay revisión de otra persona que actúe de red.
- La velocidad cayó de 44 commits en junio a 8 en agosto; parte del coste de retomar es
  reverificar a mano.
- `@vitest/coverage-v8` está instalado y nunca se usa: la cobertura no se mide.

## Propuesta

Un workflow que en cada push ejecute `npm run check` (typecheck ×2, lint, tests de backend).
E2E aparte, manual o nocturno, porque es caro. Y Dependabot para lo de
[[S6-axios-vulnerable]].

**No se creó de oficio**: modificar CI es una decisión del propietario del repositorio.

## Enlaces

- [[pruebas-y-verificacion]] · [[S6-axios-vulnerable]] · [[empaquetado-distribucion]]
