---
tags: [modulo, frontend, diseno, accesibilidad]
estado: atencion
actualizado: 2026-08-17
---

# Frontend · Sistema de diseño

## Tokens

`styles/theme.css:12-85` define ~45 CSS variables (fondos, bordes, texto, acentos, sombras,
radios, transiciones). El puente a Tailwind v4 es `@theme` en `index.css:37-61` — es Tailwind
CSS-first, no hay `tailwind.config.js`.

Clases utilitarias propias: `.av-card`, `.status-badge`, `.skeleton`, `.glass-panel`,
`.text-editorial` (`theme.css:131-223`).

## El problema

Los tokens existen pero **el consumo real es inline**: 502 usos de `var(--…)` dentro de JSX como
arbitrary values (`bg-[var(--bg-card)]`) en vez de las clases semánticas que `@theme` ya expone.
Ver [[DEUDA-tokens-diseno-inline]].

Además conviven dos generaciones de UI: la propia (`Badge`, `Modal`, `Toast`) y una inyección
posterior de shadcn/base-ui (`button.tsx` con `cva`). `button.tsx` referencia tokens
`--primary` y `--destructive` que **no están definidos** → [[BUG-tokens-button-inexistentes]].

## Accesibilidad

Puntos fuertes reales: `prefers-reduced-motion` global (`index.css:154-162`) y `:focus-visible`
global (`theme.css:226-230`).

El hueco está en los diálogos: `ui/Modal.tsx` declara `role="dialog"` y `aria-modal="true"` y
cierra con Escape, pero no gestiona el foco → [[BUG-modal-sin-focus-trap]]. Como `Modal` es la
base de todos los diálogos, un solo arreglo lo corrige en toda la app.

## Enlaces

- [[frontend-app-estado]] · [[ADR-001-local-first]]
