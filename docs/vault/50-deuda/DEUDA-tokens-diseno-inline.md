---
tags: [deuda, frontend, diseno, prioridad-baja]
prioridad: baja
esfuerzo: alto
actualizado: 2026-08-17
---

# DEUDA · Los tokens de diseño se consumen inline

## Hecho

`styles/theme.css:12-85` define ~45 variables CSS y `index.css:37-61` las expone a Tailwind v4
mediante `@theme`. La infraestructura está bien montada.

Pero hay **502 usos de `var(--…)` dentro del JSX** como arbitrary values de Tailwind
(`bg-[var(--bg-card)]`), en vez de las clases semánticas que `@theme` ya genera. Concentración:
`Manga.tsx` 65, `AnimeDetailModal.tsx` 57, `AdvancedSearch.tsx` 38, `AnimeDetailHero.tsx` 37.

## Consecuencias

- Cambiar el nombre de un token exige tocar decenas de archivos.
- El propósito se pierde: `bg-[var(--bg-card)]` dice *qué color*, no *qué es*. Una clase
  semántica sobrevive a un rediseño; una referencia directa al token, no.
- Se pierde el autocompletado y la verificación de Tailwind.

## Por qué esfuerzo alto y prioridad baja

Son 502 sustituciones repartidas por todo el frontend, y ninguna arregla un fallo visible: la
interfaz se ve correcta hoy. Es deuda de mantenibilidad pura.

## Propuesta

No hacer una migración masiva. Aplicar la regla en código nuevo, y convertir los archivos que ya
se vayan a tocar por otro motivo. Empezar por definir las clases semánticas que faltan para que
la alternativa exista.

Relacionado: el preset shadcn introdujo un segundo vocabulario de tokens que ni siquiera está
definido → [[BUG-tokens-button-inexistentes]].

## Enlaces

- [[frontend-sistema-diseno]] · [[BUG-tokens-button-inexistentes]]
