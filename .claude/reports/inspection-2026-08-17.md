# Inspección completa de MapleVault — 2026-08-17

Auditoría estática de seguridad, arquitectura, rendimiento, pruebas y documentación.
Versión 1.0.19, rama `codex/safe-sqlite-restore`.

## Método

- Reconocimiento en paralelo de los tres subsistemas con subagentes de solo lectura.
- Auditoría dirigida con `security-auditor` sobre los hallazgos de mayor impacto.
- `npm audit` en las tres raíces de paquete.
- Análisis del historial de git (60 commits, junio–agosto 2026).
- **Verificación propia** de cada hallazgo antes de darlo por bueno.

No se arrancó la aplicación. No se ejecutó ningún exploit. No se leyó ningún secreto. No se
modificó código de producto.

---

## Estado del proyecto

| Métrica | Valor |
|---|---|
| Backend | 157 archivos `.ts`, 14 módulos, 25 archivos de ruta |
| Frontend | 8 páginas, 15 archivos >300 líneas |
| Tests backend | 84 archivos (vitest) |
| Tests E2E | 7 archivos (Playwright, solo Chromium) |
| Tests frontend | **0** |
| CI | **ninguna** |
| Commits | 60, un solo autor |
| Velocidad | 44 (jun) → 8 (jul) → 8 (ago) |
| `.git` | 1.1 GB |

## Lo que está bien

Conviene establecerlo antes de la lista de problemas, porque cambia cómo leerla.

- **Modelo de amenaza local-first bien ejecutado**: bind a loopback en ambos extremos, puerto
  dinámico, token de sesión de 32 bytes por arranque entregado solo por IPC.
- **Electron correcto**: `contextIsolation`, `nodeIntegration: false` y `sandbox` en las cuatro
  ventanas; contenido remoto sin preload y en partición aislada; allowlists de canales IPC con
  rechazo por defecto.
- **Proxy de páginas con defensa en dos capas**: HMAC más re-validación de host tras decodificar.
  Filtrar el secreto no da SSRF arbitrario. Es la pieza mejor diseñada del proyecto.
- **Confirmación del chatbot correcta**: valida que el tipo de acción coincida y sustituye el
  payload por el registrado en el token.
- **SQL siempre parametrizado**; las interpolaciones son de estructura y están tras allowlist.
- **Empaquetado con tres scripts de guardia** contra builds incompletos y borrados fuera de
  `dist/`.
- **Accesibilidad**: `prefers-reduced-motion` y `:focus-visible` globales.

---

## Hallazgos de seguridad

Ninguno crítico ni alto.

| ID | Hallazgo | Severidad | Evidencia |
|---|---|---|---|
| S1 | Cuatro rutas destructivas REST sin confirmación de servidor | media | `libraryRoutes.ts:244`, `:232`, `:379`, `backupRoutes.ts:76` |
| S4 | Sin versionado de esquema; `ALTER TABLE` en `catch` vacíos | media | `db.ts:283-321` |
| S5 | `catch (_)` mudos en rutas y sin handler global de errores | media | `assistantRoutes.ts:91,108`, `libraryRoutes.ts:312` |
| S6 | `axios` vulnerable como dependencia directa en tres raíces | media | `npm audit` |
| S2 | Auth desactivada sin token — solo en desarrollo | baja | `sessionAuth.ts:16`, `main.ts:56-58` |
| S3 | `validateSafePath` sin llamadores productivos | baja | `validators.ts:376` |
| S7 | Presets `scraping` y `search` definidos y no cableados | baja | `rateLimiter.ts:93-102` |
| S8 | Extensión peligrosa validada solo en el preload | baja | `main.ts:549-561` |

### Dos severidades corregidas a la baja

S1 y S2 se plantearon inicialmente como **altas** y bajaron tras trazar el flujo completo. Se
registra porque es el tipo de corrección que se pierde si no se anota:

- **S1 → media.** `clearCatalogData` usa comparación estricta `=== false`, así que **no hay
  escalada por confusión de tipos**: un string, array u objeto caen en la rama parcial. Además la
  ruta está tras el middleware de sesión, el frontend antepone un `showConfirm()`, hay backups
  automáticos, y quien tenga el token ya puede causar daño equivalente por otras rutas.
- **S2 → baja.** En la app empaquetada el token es **siempre** aleatorio (`main.ts:56-58`); el
  escenario de token vacío es exclusivo de `npm run dev`, contenido por el bind a loopback y por
  la política CORS.

### Falsos positivos descartados

- Confusión de tipos en `keepUserList` como vector de escalada — la comparación estricta lo impide.
- Inyección SQL vía `parseInt` sin validar en `episodeRoutes.ts` — todas las queries
  parametrizadas; un `NaN` produce un 404 en vez de un 400, sin efecto explotable.
- Inyección vía `Number(req.query.limit/offset)` en `mangaRoutes.ts:444-445` — `normalizeLimit` y
  `normalizeOffset` usan `Number.isFinite` y `Math.min`.
- `catch (_) {}` en `episodeRoutes.ts:137` y `backup.ts:161-163` — caché de slug y listado de
  solo lectura; no ocultan decisiones de autorización.

---

## Bugs funcionales

| ID | Bug | Evidencia |
|---|---|---|
| B1 | La barra de búsqueda superior no filtra nada | `App.tsx:33,169` → `Topbar.tsx:52`; `App.tsx:111-115` no la propaga |
| B2 | `button.tsx` usa tokens `--primary`/`--destructive` inexistentes | vs `theme.css` |
| B3 | Mylist duplica la misma petición en la pestaña `all` | `Mylist.tsx:44-56` |
| B4 | Sidebar pide `/settings/ai` en cada navegación | `Sidebar.tsx:28-30` |
| B5 | Ruta de datos dependiente del layout → árbol huérfano | `launcher.ts:51` |

### B5 — causa raíz verificada

Existen **tres** árboles de datos: `app/data/` (2.5 MB, vivo), `app/app/data/` (1.09 MB, congelado
desde 2026-06-20, con `user_soul.json` y 4 backups) y `data/` (solo `settings.json`).

`launcher.ts:51` hace `path.resolve(__dirname, '../../app/data')`, escrito para el layout
compilado:

| Ejecución | `__dirname` | Resultado |
|---|---|---|
| Compilada | `<repo>/dist/desktop` | `<repo>/app/data` — correcto |
| Desde fuente | `<repo>/app/desktop/electron` | `<repo>/app/app/data` — huérfano |

Y `launcher.ts:63-64` crea el directorio con `mkdirSync` recursivo. El backend no tiene el
problema: `db.ts:7` cuadra en ambos layouts.

Los tres árboles están correctamente ignorados por git — **no hay fuga de datos al repositorio**.
`app/app/data/` contiene datos personales reales y **no se tocó**.

---

## Deuda estructural

- `zustand` declarado en `package.json` y **nunca importado** (0 usos).
- Sin cache, sin deduplicación, sin `AbortController` en `services/api.ts` (590 líneas, ~75
  métodos, retornos mayoritariamente `any`).
- 67 `console.error` que tragan el error; 9 `window.alert()` bloqueantes conviviendo con un
  sistema de toasts existente.
- Sin virtualización en ningún listado; `Catalog` tiene scroll infinito acumulativo.
- `Settings.tsx` 1540 líneas, `AnimeDetailModal.tsx` 1039, `Catalog.tsx` 697, `Manga.tsx` 688.
- 502 usos inline de `var(--…)` en vez de las clases semánticas que `@theme` ya genera.
- `Modal` sin focus trap, sin foco inicial, sin restauración; botón de cierre sin `aria-label`.
- Directorios vacíos: `app/backend/src/downloads/` y `e2e/`.
- `@vitest/coverage-v8` instalado y nunca ejecutado.

## Dependencias

| Raíz | Total | Crítica | Alta |
|---|---:|---:|---:|
| `/` | 8 | 1 (`tar`) | 6 |
| `app/backend` | 7 | 1 (`tar`) | 5 |
| `app/frontend` | 4 | 0 | 4 |

`axios` es la **única directa** y está en el camino real de datos. El resto son transitivas de la
cadena de build. **No se aplicó ninguna corrección** ni se modificó lockfile alguno.

## Derivas de documentación

| Afirmación | Realidad |
|---|---|
| "SQLite con `better-sqlite3`" | Se usa `sqlite3` con API de callbacks |
| "Zustand y estado React local" | Zustand nunca se importa |
| `docs/SECURITY_AUDIT.md` | Sin tocar en 35 commits |
| `AGENTS.md` recomendaba 6 subagentes | Ninguno existía (corregido el 2026-08-17) |

---

## Entregables

| Archivo | Qué |
|---|---|
| `docs/vault/` | 69 notas, 373 wikilinks, sin huérfanas ni enlaces rotos |
| `docs/SECURITY_AUDIT.md` | Reescrito; sustituye la versión obsoleta de junio |
| `docs/ROADMAP.md` | Extraído del monolito y fusionado con esta inspección |
| `docs/TOOLING.md` | 6 herramientas recomendadas, 4 explícitamente descartadas |
| `MAPLEVAULT_CLAUDE_CONTEXT.md` | Reducido de 31 KB a índice |

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | pass (exit 0) |
| `npm run lint:frontend` | pass (exit 0) |
| `npm run test:backend` | pass — 83 archivos, 681 pruebas (exit 0) |
| Notas huérfanas en el vault | 0 |
| Enlaces rotos | 0 |
| Notas >80 líneas | 0 |
| Cambios en `app/**` | ninguno |

## Rollback

`.claude-backups/20260817-190135/docs-pre-vault/` contiene `MAPLEVAULT_CLAUDE_CONTEXT.md`,
`SECURITY_AUDIT.md`, `ARCHITECTURE.md` y `README.md` originales.

## Fuera de alcance

No se tocó código de producto, no se ejecutó `npm audit fix`, no se reescribió historia de git,
no se creó workflow de CI, y no se hicieron pruebas dinámicas. Los hallazgos quedan documentados
con su corrección; aplicarlos es una decisión aparte.
