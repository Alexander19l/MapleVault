---
tags: [deuda, documentacion, prioridad-media]
prioridad: media
esfuerzo: bajo
actualizado: 2026-08-17
---

# DEUDA · La documentación se ha desviado del código

Este vault existe en buena parte por esta nota.

## Derivas concretas encontradas

| Afirmación en la documentación | Realidad |
|---|---|
| "SQLite con `better-sqlite3`" | El `package.json` declara `sqlite3` y el código usa la API de callbacks → [[ADR-006-cola-serie-sqlite]] |
| "Zustand y estado React local según el componente" | Zustand nunca se importa → [[DEUDA-zustand-sin-usar]] |
| `AGENTS.md` recomendaba 6 subagentes | Ninguno de esos nombres existía; se corrigió el 2026-08-17 |
| `MAPLEVAULT_CLAUDE_CONTEXT.md` lista 9 agentes de desarrollo | Son un diseño propuesto, no componentes instalados |
| `docs/SECURITY_AUDIT.md` | Sin tocar desde el 2026-06-25, 35 commits atrás, antes de todo el trabajo de manga, proxy firmado, CSP y lectura offline |

## La causa estructural

`MAPLEVAULT_CLAUDE_CONTEXT.md` llegó a 31 KB creciendo **append-only**: cada versión añadía una
sección (1.0.16, 1.0.17, 1.0.18, 1.0.19) sin revisar las anteriores. Un documento así no se
relee entero, así que las afirmaciones viejas nunca se corrigen — solo se entierran.

`docs/ARCHITECTURE.md` acumula 32 revisiones, el archivo más modificado del repositorio.

## Corrección aplicada

Descomposición en notas atómicas con frontmatter `actualizado`, de modo que la antigüedad de cada
afirmación sea visible. El monolito queda como índice apuntando aquí.

## Regla a mantener

Cuando una nota deje de ser cierta, se corrige la nota — no se añade otra debajo diciendo lo
contrario.

## Enlaces

- [[MOC-MapleVault]] · [[ADR-006-cola-serie-sqlite]] · [[DEUDA-zustand-sin-usar]]
