# MapleVault: contexto de continuidad

**Actualizado:** 2026-08-17 · **Versión:** 1.0.19 · **Objetivo:** Windows 10/11 x64

Este archivo era un documento de 31 KB que crecía append-only, una sección por versión. Se
descompuso en un vault de Obsidian con notas atómicas enlazadas para que se pueda consultar lo
concreto sin releerlo entero, y para que las afirmaciones obsoletas se corrijan en vez de
enterrarse.

**El contenido completo vive ahora en [`docs/vault/`](docs/vault/README.md).**
Entrada: [`docs/vault/MOC-MapleVault.md`](docs/vault/MOC-MapleVault.md).

---

## Qué es MapleVault

Aplicación de escritorio **local-first** para gestionar una biblioteca de anime y una sección
independiente de manga: catálogo, búsqueda online, scraping controlado, reproducción protegida,
traducción local opcional y asistente conversacional. Sin cuentas, sin servidor remoto, datos en
SQLite local.

Electron 42 + React 19 + Vite 8 + Tailwind 4 · Node 22 + Express + SQLite (`sqlite3`).

## Dónde buscar cada cosa

| Necesitas | Ve a |
|---|---|
| Cómo está montado un módulo | `docs/vault/10-modulos/` |
| Por qué algo se hizo así | `docs/vault/20-decisiones/` |
| Un error pasado y su regla | `docs/vault/30-incidentes/` |
| Qué cambió en cada versión | `docs/vault/40-versiones/` |
| Qué está pendiente | `docs/vault/50-deuda/` y `docs/ROADMAP.md` |
| Estado de seguridad | `docs/vault/60-seguridad/` y `docs/SECURITY_AUDIT.md` |
| Qué herramientas usar | `docs/TOOLING.md` |
| Guía de trabajo diaria | `CLAUDE.md` y `AGENTS.md` |

## Las reglas que no se negocian

Ganadas a base de incidentes reales. Antes de contradecir una, lee su nota.

1. **Identidad estricta en fuentes externas.** Nunca aceptar un episodio o capítulo por
   coincidencia parcial de texto. Las coincidencias ambiguas se descartan.
2. **Un componente opcional nunca bloquea el arranque.** Si LibreTranslate no está, el producto
   funciona y lo indica.
3. **El proxy de páginas no se convierte en ruta genérica.** Ante un fallo de carga, no se
   desactiva la allowlist, ni se acepta HTTP, ni se quita la comprobación MIME.
4. **Toda escritura del asistente pasa por confirmación con token.**
5. **No insertar datos demo en instalaciones normales.**
6. **Todo cambio de esquema necesita migración reversible.**
7. **Todo cambio de instalación se prueba en un Windows limpio.**
8. **El scraping masivo va por lotes, con progreso y cancelación.** Una fuente caída degrada,
   no bloquea.

## Verificación

```
npm run typecheck            # desktop + backend
npm run typecheck:frontend
npm run lint:frontend
npm run test:backend
npm run check                # los cuatro anteriores
npm run test:e2e             # playwright, caro
npm run dist:win             # instalador NSIS
```

## Estado en una frase

Seguridad y empaquetado bien resueltos, backend con 84 archivos de test. Los huecos están en el
frontend —sin tests, sin cache, componentes grandes— y en la ausencia de integración continua.

Detalle: `docs/vault/50-deuda/MOC-deuda.md`.

---

*El documento original de 31 KB está en `.claude-backups/20260817-190135/docs-pre-vault/`.*
