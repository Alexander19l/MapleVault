---
tags: [moc, indice, incidente]
actualizado: 2026-08-17
---

# MOC · Incidentes

Problemas que ya ocurrieron y la regla que dejaron. Volver a [[MOC-MapleVault]].

Todos están **resueltos**. Se conservan porque la regla que produjeron sigue vigente, y porque el
diagnóstico ahorra tiempo si el síntoma reaparece.

| Incidente | Módulo | Regla que dejó |
|---|---|---|
| [[INC-001-animeav1-temporada-cruzada]] | [[backend-scraping-anime]] | Identidad estricta; nunca coincidencia parcial de texto |
| [[INC-002-urls-invalidas-fuentes]] | [[backend-scraping-anime]] | Un enlace en la ficha no prueba disponibilidad |
| [[INC-003-scraping-bloqueaba-ui]] | [[backend-scraping-anime]] | Trabajo largo por lotes, con progreso y cancelación |
| [[INC-004-libretranslate-arranque]] | [[backend-traduccion]] | Un componente opcional nunca bloquea el arranque |
| [[INC-005-puerto-5000-empaquetado]] | [[desktop-electron]] | Puerto dinámico y token local en producción |
| [[INC-006-paginas-manga-no-cargaban]] | [[backend-manga]] | No relajar la allowlist para arreglar una carga |
| [[INC-007-modal-desplazado-transform]] | [[frontend-sistema-diseno]] | Los overlays se montan por portal en `body` |

## El patrón

Cuatro de los siete tienen la misma forma: **se confió en una señal débil**. Un título parecido,
un enlace presente, un puerto asumido, un `position: fixed` que no era fijo.

El antídoto que ya está en el código es validar la identidad de forma explícita en vez de
inferirla del contexto.

## Diagnóstico rápido

[[INC-006-paginas-manga-no-cargaban]] incluye una checklist de seis pasos para cuando el lector
muestre páginas vacías. Es la nota más útil de esta carpeta en caliente.
