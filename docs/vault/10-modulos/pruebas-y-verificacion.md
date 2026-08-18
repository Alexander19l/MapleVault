---
tags: [modulo, pruebas, calidad]
estado: atencion
actualizado: 2026-08-17
---

# Pruebas y verificación

## Estado real

- **Backend: 84 archivos de test** con vitest (39 en `tests/unit/`, 4 en `tests/integration/`,
  41 en `src/**/__tests__/`). Es sólido.
- **E2E: 7 archivos** de Playwright en `tests/`, solo proyecto `chromium`.
- **Frontend: cero tests unitarios.** Solo `typecheck:frontend` y `lint:frontend`.
- **Desktop:** solo `playerRequest.ts` y `mangaOfflineStorage.ts` tienen cobertura, desde vitest
  del backend. `main.ts`, `preload.ts`, `launcher.ts` y `adblock/*` no tienen ninguna.
- Módulos de backend sin tests: `agents/` y `anime/`.
- El directorio `e2e/` existe y está vacío.

## Comandos

```
npm run typecheck            # desktop + backend
npm run typecheck:frontend
npm run lint:frontend
npm run test:backend
npm run test:e2e             # playwright, caro
npm run check                # los cuatro primeros, sin e2e
```

## El hueco principal

**No existe CI.** `playwright.config.ts:20-24` ya condiciona `forbidOnly`, `retries` y `workers`
a `process.env.CI`, escrito para un CI que nunca se configuró. Toda verificación es manual →
[[DEUDA-sin-ci]].

`@vitest/coverage-v8` está instalado y no se usa: la cobertura nunca se mide.

## Enlaces

- [[empaquetado-distribucion]] · [[DEUDA-tests-frontend-ausentes]] · [[DEUDA-desktop-sin-tests]]
