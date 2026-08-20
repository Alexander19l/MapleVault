# Skills & Agents Update Report — 2026-08-17

Instalación inicial del stack según `CLAUDECODE_SKILLS_AGENTS_PLAYBOOK.md`.

## Estado

| | |
|---|---|
| Fecha | 2026-08-17 |
| Claude Code | 2.1.233 |
| OS / Shell | Windows 11 (10.0.26200) / PowerShell 5.1 |
| Estado previo | Sin `.claude/` de proyecto. Sin agentes ni skills de usuario. Solo `~/.claude/settings.json` con el plugin `superpowers@6.3.0` y 20 reglas `allow` de git/gh. |
| Backup | `.claude-backups/20260817-092702/` |
| Git dirty | Sí — 12 archivos de producto ya modificados en `codex/safe-sqlite-restore`. **No se mezclaron** con este trabajo. |

## Upstream

| Fuente | SHA anterior | SHA fijado | Licencia verificada |
|---|---|---|---|
| ECC | (ninguno) | `06c5e118c4d3e6c3b7f9445f973a2194c82de193` | MIT — © 2026 Affaan Mustafa |
| Hermes Agent | (ninguno) | `cf64ca20c5ab99ebf7e8ca272c69edc7ea0636ed` | MIT — © 2025 Nous Research |

Ambas licencias comprobadas en el propio commit fijado, no en `main`.

**Nota:** durante la sesión, el HEAD de Hermes avanzó a `4323c67dcc6048fc8e311cdff7600d3d6a17807f`.
El lock conserva `cf64ca2` **a propósito**: registra el commit que realmente se revisó, no el más
reciente. La próxima actualización diferirá exactamente desde ahí. El repositorio se mueve rápido.

### Método de obtención

No se clonó ningún repositorio. SHAs por `git ls-remote`; contenido por lectura dirigida de 14
archivos concretos vía API. Motivo: Hermes contiene `cli.py` (944 KB), `hermes_state.py` (591 KB) y
`uv.lock` (717 KB); ECC un `README.md` de 116 KB más `install.sh`, `install.ps1`, `hooks/` y
`.mcp.json`. **Ningún archivo ejecutable de terceros llegó al disco.**

## Candidatos evaluados

| Candidato | Fuente | Score | Decisión | Motivo |
|---|---|---:|---|---|
| `agents/code-explorer.md` | ECC | 92 | Importar | Solo lectura, barato, encaja exacto con `code-reader` |
| `agents/type-design-analyzer.md` | ECC | 88 | Fusionar | 1.9 KB, solo lectura, 4 dimensiones reutilizables |
| `agents/silent-failure-hunter.md` | ECC | 87 | Fusionar | Errores tragados; cabe entero en `security-auditor` |
| `agents/pr-test-analyzer.md` | ECC | 87 | Fusionar | Cobertura conductual; cabe en `test-verifier` |
| `agents/code-simplifier.md` | ECC | 82 | Importar | Principios sólidos; se acotaron sus tools |
| `agents/security-reviewer.md` | ECC | 81 | Importar endurecido | Buena cobertura OWASP, pero con `Bash` y sin prohibir `.env` |
| `agents/a11y-architect.md` | ECC | 78 | Referencia | WCAG 2.2 valioso; 7.3 KB con mucho SwiftUI/Compose irrelevante |
| `skills/.../systematic-debugging` | Hermes | 78 | Referencia (solo deltas) | Redundancia casi total con `superpowers` ya instalado |
| `agents/react-reviewer.md` | ECC | 76 | Referencia | 11.4 KB; carriles React excelentes, resto no aplica |
| `agents/harness-optimizer.md` | ECC | 76 | Referencia | Depende de `/harness-audit`, que no existe sin ECC completo |
| `skills/.../simplify-code` | Hermes | 74 | Referencia | 4 perspectivas excelentes; fan-out de 4 subagentes, caro |
| `agents/refactor-cleaner.md` | ECC | 72 | Referencia | `npx knip/depcheck` descarga paquetes; auto-commit por lote |
| `agents/performance-optimizer.md` | ECC | 66 | Referencia parcial | 13.4 KB; dogma de memoización y herramientas que instalan |
| `agents/typescript-reviewer.md` | ECC | — | No evaluado | 9 KB; omitido por redundancia con `frontend-director`. **No fue leído en detalle** — registrado para la próxima revisión. |
| Otros 56 agentes de ECC | ECC | — | Descartar | Fuera del stack o fuera de las prioridades |
| `test-driven-development`, `requesting-code-review`, `plan`, `spike` | Hermes | — | Descartar | Redundancia demostrable con `superpowers` 6.3.0, del que derivan |
| `frontend-design` | Plugin oficial | — | Referencia | Solapa >70 % con `anti-ai-design`, dirección genérica |
| `security-guidance` | Plugin oficial | — | **Pendiente de aprobación** | ~400 KB de hooks Python en eventos de sesión |

Pesos: seguridad 25, tokens/contexto 20, utilidad 20, compatibilidad 15, mantenibilidad 10,
baja redundancia 10.

## Fusionados

| Agente local | Absorbe | Cambio más relevante frente al upstream |
|---|---|---|
| `code-reader` | ECC `code-explorer` | Orden Glob→Grep→Read acotado; presupuesto de 12 archivos y 80 líneas |
| `code-optimizer` | ECC `code-simplifier` + `performance-optimizer` + `refactor-cleaner`; Hermes `simplify-code` | Memoización invertida: de recomendada por defecto a exigir justificación medida. Fan-out de 4 → recorrido secuencial |
| `frontend-director` | ECC `react-reviewer` + `a11y-architect` + `type-design-analyzer` | Dirección anti-plantilla + modo auditoría por defecto |
| `security-auditor` | ECC `security-reviewer` + `silent-failure-hunter` | **`Bash` eliminado**, `.env` prohibido, campo `confianza` obligatorio |
| `test-verifier` | ECC `pr-test-analyzer` | Descubrimiento de scripts antes de ejecutar; nada de instalar |
| `stack-maintainer` | ECC `harness-optimizer` | Sin dependencia de `/harness-audit` |
| `CLAUDE.md` | Hermes `systematic-debugging` (solo deltas) | 4 refuerzos sobre `superpowers`, sin duplicar la skill |

## Seguridad

**Escaneo de los 14 archivos leídos** (`curl|sh`, `sudo`, `rm -rf`, `chmod 777`, `eval`, `exec`,
`subprocess`, `.env`, `.ssh`, `.aws`, `API_KEY`, `git push`, `publish`, bypass de permisos):

- Coincidencias reales, todas **rechazadas**, ninguna maliciosa:
  - `refactor-cleaner`: `npx knip`, `npx depcheck`, `npx ts-prune` — descargarían paquetes.
  - `performance-optimizer`: `npx lighthouse`, `npx bundle-analyzer`, `node --prof` — descargas y red.
  - `security-reviewer`: `npm audit`, `npx eslint --plugin security` — instalaría un plugin.
  - `refactor-cleaner`: "commit después de cada lote" — un agente no debe hacer commit.
- Sin `curl|sh`, sin `sudo`, sin lectura de secretos, sin hooks, sin MCP y sin red en los archivos
  revisados.
- Señal positiva: los agentes de ECC llevan un "Prompt Defense Baseline". La idea se conservó,
  comprimida de 6 viñetas (~900 B/agente) a una frase.

**Nada ejecutado. Nada instalado. Cuarentena vacía** — no se descargó nada ejecutable.

**Nuevos permisos concedidos:** ninguno de red ni de escritura. Solo se **añadieron restricciones**
(`deny`, `ask`) más cuatro `allow` de comprobaciones de solo lectura (`npm run typecheck*`,
`npm run lint*`, `npm run format:check*`, `git ls-remote*`).

## Contexto y tokens

| Componente | Antes (upstream) | Después (local) | Delta |
|---|---:|---:|---:|
| 11 agentes ECC efectivamente revisados | 53 902 B | — | — |
| 6 agentes canónicos que los absorben | — | 29 689 B | **−45 %** |
| 2 skills | — | 9 716 B | — |
| **Total del stack** | — | **39 405 B** | — |

Solo los 11 agentes ECC leídos entran en la comparación; `typescript-reviewer` (9 068 B) queda fuera
porque no se revisó. Los 2 `SKILL.md` de Hermes leídos suman otros ~19 KB de los que solo se
conservaron los deltas.

Ningún componente excede su presupuesto: agentes ≤ 6144 B / 180 líneas, skills ≤ 8192 B / 250 líneas.
`code-optimizer` (6134 B) y `frontend-director` (6144 B) requirieron varias pasadas de recorte.

Optimizaciones aplicadas: `Prompt Defense Baseline` comprimido; tablas markdown convertidas a prosa
compacta; bloques de salida YAML colapsados a notación inline; eliminada la sección de complejidad
duplicada con la perspectiva *Efficiency*; ejemplos de código de ECC no copiados.

## Validación

| Comprobación | Resultado |
|---|---|
| JSON de registry, provenance, SOURCES, lock y settings parsean | pass |
| Frontmatter abre/cierra en los 8 componentes | pass |
| `name` coincide con el nombre de archivo/directorio en los 8 | pass |
| Cero claves obsoletas (`maxTurns`) | pass |
| Presupuestos de bytes y líneas | pass |
| `npm run typecheck` | pass (exit 0) |
| `npm run lint:frontend` | pass (exit 0) |
| `git status` — sin cambios propios en `app/**` | pass |

### Smoke tests

Los agentes se descubren al arrancar la sesión, así que la sesión en curso no los veía. Se validaron
lanzando sesiones CLI nuevas (`claude -p --agent <nombre>`), lo que ejercita la ruta de carga real.

| Agente | Resultado |
|---|---|
| `code-reader` | pass — `model: haiku` resuelve; usó Glob; 3 líneas; cero modificaciones |
| `frontend-director` | pass — `Skill` válido en `tools`; modo auditoría respetado; 5 hallazgos reales con `file:line`; `archivos_modificados: []` |
| `security-auditor` | pass — solo lectura; separó hechos de hipótesis; listó 4 falsos positivos descartados; reportó honestamente que no pudo leer `~/.claude/` en vez de inventarlo |
| `test-verifier` | pass (con matiz) — identificó `npm run lint:frontend` correctamente y **se detuvo en el límite de permisos** en vez de saltárselo. Comportamiento correcto; el lint se verificó por separado y pasa |
| `stack-maintainer` | pass — leyó el lock, resolvió ambos HEAD por `ls-remote`, reportó `NO CHANGE` en ECC y detectó que Hermes había avanzado. No escribió nada |

Los smoke tests confirmaron dos claves de frontmatter que ningún agente oficial usa y que por tanto
eran el riesgo real del plan: `model: haiku` y `Skill` dentro de `tools`. Ambas funcionan.

## Archivos creados / modificados

**Creados (usuario):** `~/.claude/agents/{code-reader,code-optimizer,frontend-director,security-auditor,test-verifier,stack-maintainer}.md`,
`~/.claude/skills/{anti-ai-design,stack-maintainer}/SKILL.md`

**Creados (proyecto):** `CLAUDE.md`, `.claude/registry/{registry.json,provenance.json,decisions.md}`,
`.claude/upstream/{SOURCES.json,UPSTREAM.lock.json}`, `.claude/quarantine/README.md`,
`.claude/reports/skills-agents-update-2026-08-17.md`

**Modificados:** `~/.claude/settings.json` (fusión: se conservaron `enabledPlugins`,
`autoUpdatesChannel`, `theme`, `model` y las 20 reglas `allow`; se añadieron `ask`, `deny` y 4
`allow` de verificación) · `AGENTS.md` (solo la sección "Subagentes", que listaba seis agentes
inexistentes) · `.gitignore` (una línea: `.claude-backups/`)

**No tocados:** ningún archivo bajo `app/`, `scripts/`, `docs/` ni `tests/`.

## Rollback

```
.claude-backups/20260817-092702/
├── user/settings.json      ← settings originales
├── project/AGENTS.md       ← AGENTS.md original
└── MANIFEST.txt
```

Para revertir: restaurar esos dos archivos, quitar la línea `.claude-backups/` de `.gitignore`, y
borrar `~/.claude/agents/`, `~/.claude/skills/`, `<proyecto>/.claude/` y `CLAUDE.md`. Nada más se
modificó.

## Pendiente de aprobación

1. **`security-guidance@claude-plugins-official`** — hooks Python ejecutables en eventos de sesión.
2. **`frontend-design@claude-plugins-official`** — sin riesgo, pero solapa con `anti-ai-design`.
3. **`vercel-labs/agent-skills`** — `react-best-practices` y `web-design-guidelines`, sin evaluar;
   requiere verificar licencia antes de copiar material sustancial.
4. **ECC `agents/typescript-reviewer.md`** — no leído; reevaluar en la próxima actualización.

## Próxima acción

Reiniciar Claude Code para que los seis agentes queden disponibles vía delegación normal en esta
sesión de trabajo, en vez de solo mediante `claude -p --agent`.
