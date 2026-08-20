# MapleVault — Herramientas recomendadas

**Actualizado:** 2026-08-17

Cada recomendación responde a un hallazgo concreto de la inspección. Ninguna se añade "porque es
buena práctica": si no resuelve un problema observado, no está aquí.

---

## Recomendadas

### GitHub Actions — el mayor retorno del proyecto

**Resuelve:** no existe CI. Toda verificación depende de que alguien recuerde ejecutar
`npm run check`.

**Coste:** un archivo. `playwright.config.ts:20-24` ya condiciona `forbidOnly`, `retries` y
`workers` a `process.env.CI` — la configuración está escrita para un CI que nunca se creó.

**Alcance sugerido:** en cada push, `npm run check` (typecheck ×2, lint, tests de backend). E2E
aparte, manual o nocturno, porque es caro y necesita navegador.

**No se creó de oficio:** modificar CI es decisión del propietario del repositorio.

### Dependabot

**Resuelve:** 8 vulnerabilidades en la raíz, 7 en backend, 4 en frontend, con `axios` como única
directa. Sin CI ni Dependabot, nadie se entera hasta que alguien ejecuta `npm audit` a mano.

**Coste:** un `.github/dependabot.yml` con las tres raíces. Conviene agrupar las actualizaciones
de parche para no recibir tres PR al día.

### `PRAGMA user_version` — sin dependencias

**Resuelve:** no hay versionado de esquema; los `ALTER TABLE` viven en `try/catch` vacíos
(`db.ts:283-321`) y cualquier error que no sea "columna duplicada" se traga.

**Coste:** ninguno en dependencias. SQLite ya lo ofrece. Leer la versión al abrir, aplicar en
orden las migraciones superiores dentro de una transacción, escribir la nueva versión, y abortar
el arranque si una falla.

La cola serie y `withTransaction` que ya existen dan la serialización necesaria.

### `eslint-plugin-jsx-a11y`

**Resuelve:** los huecos de accesibilidad de forma determinista, en vez de por revisión manual.
Habría detectado el botón de cierre sin `aria-label` del `Modal`.

**Coste:** una dev dependency y ajustar la config de ESLint. Empezar con las reglas en `warn`
para no bloquear el build de golpe.

**Nota:** no detecta la falta de focus trap. Eso sigue requiriendo un test.

### `@vitest/coverage-v8` — ya instalado

**Resuelve:** la cobertura nunca se mide, así que no se sabe qué zonas del backend están
realmente cubiertas por los 84 archivos de test.

**Coste:** cero. Ya está en `app/backend/package.json`. Solo falta un script que lo invoque.

**Advertencia:** usarlo para encontrar zonas sin cubrir, no para perseguir un porcentaje. Un 90 %
de cobertura con asertos débiles vale menos que un 60 % con asertos que fallan cuando algo se
rompe.

### `knip`

**Resuelve:** el inventario de código muerto — `validateSafePath` sin llamadores, `zustand` sin
importar, `downloads/` y `e2e/` vacíos, dos presets de rate limit sin cablear.

**Coste:** una dev dependency, ejecutada bajo demanda, no en CI.

**Advertencia importante:** marca como muertos los exports usados dinámicamente (imports por
string, reflexión). Hay que grepear el símbolo antes de borrar nada. Un informe limpio no es
prueba.

---

## Diferidas

### `react-window` u otra virtualización

**Solo tras medir.** Ningún listado está virtualizado, pero tampoco hay medición que demuestre
que duele. Una biblioteca personal rara vez llega a los miles de elementos donde importa.

Antes de virtualizar: probar `React.memo` en `AnimeCard` (306 líneas, renderizado en bucle en
tres páginas, hoy sin memoizar). Es más barato y probablemente suficiente.

---

## Explícitamente NO recomendadas

### `better-sqlite3`

La documentación del proyecto afirmaba que ya se usaba; no es cierto, se usa `sqlite3`. Migrar
implica reescribir toda la capa de acceso y recompilar un módulo nativo que ya está resuelto en
el empaquetado.

El problema que motivaría el cambio —concurrencia— ya lo resuelve la cola serie
(`enqueueDbOperation`). No hay beneficio proporcional al riesgo.

### `@tanstack/react-query` u otra librería de datos

Resolvería la falta de cache, deduplicación y cancelación. Pero **Zustand ya está en el
`package.json` y nunca se ha importado**: añadir una segunda librería de estado antes de usar la
que ya se paga es la decisión equivocada.

Si Zustand resulta insuficiente tras intentarlo, entonces sí es momento de reevaluar.

### `helmet`

Aportaría cabeceras que aquí no aplican: no hay HTTPS que forzar con HSTS, y la CSP se aplica en
la capa Electron. Las cuatro cabeceras que sí tienen sentido ya están puestas a mano
(`server.ts:48-54`).

### Un router en el frontend

En Electron no hay URLs que compartir ni deep links externos. La navegación por `switch` funciona.
Los problemas atribuibles a esa decisión —`searchValue` perdido, sin cache— se resuelven con una
store, no con un router.

---

## Regla general

Antes de añadir una dependencia: ¿qué hallazgo concreto resuelve, cuánto pesa, quién la mantiene,
y hay algo ya instalado que sirva? Las tres primeras recomendaciones de este documento no añaden
ninguna dependencia de ejecución.
