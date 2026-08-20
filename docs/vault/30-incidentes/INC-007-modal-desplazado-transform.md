---
tags: [incidente, frontend, resuelto]
actualizado: 2026-08-17
---

# INC-007 · El modal aparecía desplazado respecto al viewport

## Síntoma

El panel de ficha de manga se abría fuera de posición, desplazado respecto a la pantalla.

## Causa

El modal se montaba dentro del árbol de la vista. Cualquier ancestro con `transform` crea un
nuevo contexto de posicionamiento, de modo que `position: fixed` deja de referirse al viewport y
pasa a referirse a ese ancestro. Las animaciones de entrada de la vista de manga usaban
`transform`, así que el modal heredaba el desplazamiento.

## Corrección

`Modal` pasó a montarse mediante un **portal en `document.body`** (1.0.19), fuera del alcance de
cualquier `transform` de la vista.

## Regla permanente

Todo overlay —modal, popover, tooltip, toast— se monta por portal en `body`. Un componente
flotante no debe depender de que ningún ancestro se abstenga de usar `transform`.

## Deuda que quedó abierta

El mismo `Modal` sigue sin gestión de foco: no hay focus trap, ni foco inicial, ni restauración
al cerrar → [[BUG-modal-sin-focus-trap]].

## Enlaces

- [[frontend-sistema-diseno]] · [[v1.0.19-lector-online-feed-sinopsis]] · [[BUG-modal-sin-focus-trap]]
