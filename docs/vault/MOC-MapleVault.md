---
tags: [moc, indice]
actualizado: 2026-08-17
---

# MapleVault · Mapa de contenidos

Punto de entrada del vault. Las convenciones y el mantenimiento están en [[README]]. MapleVault es una aplicación de escritorio **local-first** para
gestionar una biblioteca de anime y una sección independiente de manga, con catálogo, búsqueda
online, scraping controlado, reproducción protegida, traducción local opcional y asistente
conversacional.

**Versión actual:** 1.0.19 · **Objetivo:** Windows 10/11 x64 · **Rama:** `codex/safe-sqlite-restore`

## Por dónde empezar

| Si quieres… | Ve a |
|---|---|
| Entender cómo está montado | [[MOC-modulos]] |
| Saber por qué algo se hizo así | [[MOC-decisiones]] |
| Evitar repetir un error pasado | [[MOC-incidentes]] |
| Ver qué hay que arreglar | [[MOC-deuda]] |
| Revisar la postura de seguridad | [[MOC-seguridad]] |
| Seguir la evolución del producto | [[MOC-versiones]] |

## Los cinco archivos que más importan

1. `app/backend/src/server.ts` — [[backend-server]]
2. `app/backend/src/database/db.ts` — [[backend-base-de-datos]]
3. `app/backend/src/security/validators.ts` — [[backend-seguridad]]
4. `app/desktop/electron/main.ts` — [[desktop-electron]]
5. `app/frontend/src/services/api.ts` — [[frontend-capa-datos]]

## Estado en una frase

La postura de seguridad y el empaquetado están bien resueltos; el backend tiene 84 archivos de
test. Los huecos están en el frontend (sin tests, sin cache, componentes grandes) y en la
ausencia total de integración continua → [[DEUDA-sin-ci]].

## Reglas permanentes

Estas cuatro se han ganado a base de incidentes y no deben relajarse:

- Nunca aceptar un episodio por coincidencia parcial de texto → [[INC-001-animeav1-temporada-cruzada]].
- Un componente opcional nunca bloquea el arranque → [[ADR-009-traduccion-opcional-degradada]].
- El proxy de páginas no se convierte en ruta genérica → [[ADR-002-proxy-firmado-paginas]].
- Toda escritura del asistente pasa por confirmación → [[ADR-004-confirmacion-token-chatbot]].

## Verificación

```
npm run check     # typecheck + typecheck:frontend + lint:frontend + test:backend
npm run test:e2e  # playwright, caro
```

Ver [[pruebas-y-verificacion]].
