---
tags: [meta]
actualizado: 2026-08-17
---

# Vault de MapleVault

Bóveda de Obsidian con la memoria técnica del proyecto: 61 notas atómicas enlazadas.

## Cómo abrirlo

Obsidian → *Abrir carpeta como bóveda* → seleccionar `docs/vault/`. No hace falta instalar
ningún plugin: los wikilinks y el grafo son funcionalidad nativa.

Empieza por [[MOC-MapleVault]].

## Por qué existe

`MAPLEVAULT_CLAUDE_CONTEXT.md` llegó a 31 KB creciendo append-only: una sección por versión,
apiladas sin revisar las anteriores. Un documento así hay que releerlo entero para encontrar una
cosa, y las afirmaciones obsoletas nunca se corrigen porque nadie vuelve a leerlas — solo quedan
enterradas. Ver [[DEUDA-deriva-documentacion]].

Aquí cada nota responde **una** pregunta, y el grafo muestra dónde se concentran los problemas.

## Estructura

| Carpeta | Qué contiene | Notas |
|---|---|---:|
| `10-modulos/` | Un módulo del sistema por nota | 13 |
| `20-decisiones/` | ADR: por qué algo se hizo así | 10 |
| `30-incidentes/` | Problemas pasados y la regla que dejaron | 7 |
| `40-versiones/` | Historia por versión publicada | 4 |
| `50-deuda/` | Deuda técnica y defectos abiertos | 19 |
| `60-seguridad/` | Hallazgos de la auditoría | 8 |

## Convenciones

- **Frontmatter** en toda nota: `tags`, `actualizado`, y según el tipo `estado`, `prioridad`,
  `esfuerzo`, `severidad` o `confianza`.
- **Enlaces** con doble corchete. Cada nota enlaza al menos a su módulo.
- **Prefijos** `ADR-`, `INC-`, `S`, `DEUDA-`, `BUG-` para que el nombre diga el tipo.
- **Evidencia** siempre como `archivo:línea`. Una afirmación sin evidencia es una hipótesis y se
  marca como tal.
- **Longitud**: ninguna nota pasa de 80 líneas. Si crece, se parte.

## Cómo leer el grafo

Los nodos con más conexiones entrantes son los módulos: casi toda decisión, incidente o deuda
apunta a uno. Filtrando por la etiqueta `deuda` se ve de un vistazo qué zona del sistema
concentra el trabajo pendiente — hoy, el frontend.

## Cómo mantenerlo

Cuando una nota deje de ser cierta, **se corrige la nota**. No se añade otra debajo diciendo lo
contrario: así es como el documento anterior acabó contradiciéndose a sí mismo.

Al cerrar una deuda, cambiar `estado` y dejar el enlace: el grafo debe conservar la historia.
