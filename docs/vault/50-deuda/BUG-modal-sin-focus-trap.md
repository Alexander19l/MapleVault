---
tags: [bug, frontend, accesibilidad, prioridad-alta]
prioridad: alta
esfuerzo: bajo
actualizado: 2026-08-17
---

# BUG · Modal sin gestión de foco

## Lo que sí hace

`components/ui/Modal.tsx` cierra con `Escape` (`:22-38`), bloquea el scroll del body, y declara
`role="dialog"` y `aria-modal="true"` (`:55-57`). El andamiaje semántico está.

## Lo que falta

- **Sin focus trap**: tabulando se sale del diálogo hacia la página de detrás, que sigue siendo
  operable pese al `aria-modal`.
- **Sin foco inicial**: al abrir, el foco se queda donde estaba; un lector de pantalla no anuncia
  el diálogo.
- **Sin restauración de foco** al cerrar: se pierde el punto donde estaba el usuario.
- El botón de cierre (`:64-69`) **no tiene `aria-label`**.
- El overlay declara `role="presentation"` (`:51`) pero no cierra al pulsarlo: solo hay
  `stopPropagation` en el panel (`:54`), sin `onClick` en el fondo. Es una expectativa rota.

## Por qué es prioritario pese a ser "solo" accesibilidad

`Modal` es la base de **todos** los diálogos de la aplicación, incluido el panel de ficha de
manga y los de Ajustes. Un solo arreglo lo corrige en toda la app; dejarlo, lo multiplica.

## Contexto

El resto del frontend tiene buena base de accesibilidad: `prefers-reduced-motion` global
(`index.css:154-162`) y `:focus-visible` global (`theme.css:226-230`). El hueco está concentrado
justo aquí.

## Enlaces

- [[frontend-sistema-diseno]] · [[INC-007-modal-desplazado-transform]]
