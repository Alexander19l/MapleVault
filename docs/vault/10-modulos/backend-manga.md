---
tags: [modulo, backend, manga, seguridad]
estado: estable
actualizado: 2026-08-17
---

# Backend · Manga

Tres proveedores tras adaptadores aislados y el proxy de páginas, que es la pieza de seguridad
más elaborada del proyecto.

**Directorio:** `app/backend/src/manga/` · **Router:** `routes/mangaRoutes.ts` (15 rutas)

## Proveedores

- **MangaDex** — principal. API oficial, `/manga/:id/feed` paginado de 100 en 100 respetando
  `total`, límite defensivo de 10 000 registros. Idiomas aceptados: `es`, `es-la`, `en`; `es-la`
  se normaliza a `es` en el contrato → [[ADR-008-idiomas-manga-restringidos]].
- **ZonaTMO** y **ShadeManga** — secundarios, scraping HTML. Sin soporte de filtros; la UI debe
  comunicar la limitación en vez de fingir que filtra.

## Proxy de páginas

`manga/mangaPageProxy.ts` — el único punto donde una URL externa se pide desde el backend.
Defensa en dos capas: firma HMAC-SHA256 verificada con `timingSafeEqual` (`:36,48`), expiración
de 2 h (`:3,43`), **y** re-validación de host contra allowlist más `https:` obligatorio tras
decodificar (`:19-28,49`). Respuesta limitada a `content-type: image/*`, 15 s, 20 MB
(`mangaRoutes.ts:257-260`).

La doble validación es lo que importa: aunque se filtre el secreto de firma, no se obtiene SSRF
arbitrario. Ver [[ADR-002-proxy-firmado-paginas]] y [[INC-006-paginas-manga-no-cargaban]].

## Límites

`MAX_DOWNLOAD_BYTES` 256 MB y `MAX_PAGE_COUNT` 500 (`mangadexProvider.ts:10-11`).
`createRequestGate()` serializa las peticiones a MangaDex (`:261,288,300`).

Las descargas se sirven en memoria como ZIP; el backend nunca escribe el archivo a disco
(`mangaRoutes.ts:355-361`). El guardado en disco ocurre en Electron →
[[desktop-electron]].

## Enlaces

- [[backend-seguridad]] · [[backend-traduccion]] · [[frontend-capa-datos]]
- [[v1.0.19-lector-online-feed-sinopsis]] · [[ADR-010-lector-sin-deteccion-paneles]]
