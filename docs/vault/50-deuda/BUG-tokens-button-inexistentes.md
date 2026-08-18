---
tags: [bug, frontend, diseno, prioridad-alta]
prioridad: alta
esfuerzo: bajo
actualizado: 2026-08-17
---

# BUG · button.tsx usa tokens de color que no existen

## Hecho

`components/ui/button.tsx` referencia las variables CSS `--primary` y `--destructive`. Un barrido
de esos nombres en `styles/theme.css` e `index.css` **no encuentra ninguna definición**.

`theme.css` define ~45 variables, pero con otra nomenclatura: `--bg-*`, `--border-*`, `--text-*`,
`--accent-*`.

## Consecuencia

Las variantes de `button.tsx` que dependen de esos tokens renderizan con color indefinido: el
navegador ignora la propiedad y hereda o cae al valor por defecto. Solo las variantes que usan
tokens reales del tema se ven como se pretendía.

## Causa

Conviven dos generaciones de UI. La propia (`Badge`, `Modal`, `Toast`, tokens `--bg-*`) y una
inyección posterior de shadcn/base-ui (`button.tsx` con `cva`, `components.json` declarando el
preset `base-nova`). El preset trae su vocabulario de tokens y nadie lo conectó al tema
existente.

## Corrección

Una de dos: definir `--primary`/`--destructive` en `theme.css` mapeándolos a los acentos que ya
existen, o reescribir las variantes de `button.tsx` para usar el vocabulario del tema.

La primera es menos invasiva y deja la puerta abierta a más componentes shadcn.

## Enlaces

- [[frontend-sistema-diseno]] · [[DEUDA-tokens-diseno-inline]]
