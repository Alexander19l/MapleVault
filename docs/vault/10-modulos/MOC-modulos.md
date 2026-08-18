---
tags: [moc, indice, modulo]
actualizado: 2026-08-17
---

# MOC · Módulos

Un módulo por nota. Volver a [[MOC-MapleVault]].

## Backend — `app/backend/src/`

| Nota | Responsabilidad | Estado |
|---|---|---|
| [[backend-server]] | Composición de Express y orden de middleware | estable |
| [[backend-seguridad]] | Auth, CORS, rate limit, saneado, validadores | estable |
| [[backend-base-de-datos]] | SQLite, cola serie, transacciones, backups | atención |
| [[backend-manga]] | MangaDex, ZonaTMO, ShadeManga y proxy de páginas | estable |
| [[backend-scraping-anime]] | AniList, Jikan y proveedores de episodios | estable |
| [[backend-chatbot]] | Maple Assistant, intenciones y acciones protegidas | estable |
| [[backend-traduccion]] | LibreTranslate opcional y cache | estable |

## Frontend — `app/frontend/src/`

| Nota | Responsabilidad | Estado |
|---|---|---|
| [[frontend-app-estado]] | Navegación por switch y estado global | atención |
| [[frontend-capa-datos]] | Cliente axios y llamadas al backend | atención |
| [[frontend-sistema-diseno]] | Tokens, primitivas de UI y accesibilidad | atención |

## Escritorio y proceso

| Nota | Responsabilidad | Estado |
|---|---|---|
| [[desktop-electron]] | Ventanas, IPC, arranque del backend, offline | estable |
| [[empaquetado-distribucion]] | electron-builder, scripts de guardia, NSIS | estable |
| [[pruebas-y-verificacion]] | Vitest, Playwright y comandos de verificación | atención |

## Cómo leer el grafo

Los módulos son los nodos con más conexiones entrantes: casi toda decisión, incidente, deuda o
hallazgo apunta a uno. Un módulo con muchas flechas de [[MOC-deuda]] es donde conviene invertir.
