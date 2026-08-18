---
tags: [incidente, traduccion, instalacion, resuelto]
actualizado: 2026-08-17
---

# INC-004 · LibreTranslate impedía arrancar en Windows limpio

## Síntoma

En instalaciones nuevas el backend podía quedarse colgado o fallar al arrancar por culpa de la
capa de traducción.

## Causas, todas reales

- Python ausente en el sistema.
- Módulo incorrecto o versión incompatible.
- Modelo de idioma no descargado.
- Puerto ya ocupado por otro proceso.

Cuatro modos de fallo distintos en un componente **opcional** que estaba bloqueando el arranque
de todo lo demás.

## Corrección

Commits `738020f2` (*Fix LibreTranslate setup on clean Windows*) y `7988a927` (*Add optional
LibreTranslate installation*). El arranque pasó a degradar sin bloquear: si la traducción no está
disponible, el backend arranca igual y la funcionalidad se marca como no disponible.

## Regla permanente

Un componente opcional **nunca** bloquea el arranque. Ver
[[ADR-009-traduccion-opcional-degradada]].

Corolario para probar: todo cambio de instalación debe verificarse en un Windows limpio, no solo
en la máquina de desarrollo donde las dependencias ya están.

## Enlaces

- [[backend-traduccion]] · [[ADR-009-traduccion-opcional-degradada]] · [[empaquetado-distribucion]]
