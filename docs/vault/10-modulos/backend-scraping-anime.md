---
tags: [modulo, backend, scraping]
estado: estable
actualizado: 2026-08-17
---

# Backend · Scraping de anime

Todos los proveedores externos de anime. `scraping/scraper.ts` supera las 1500 líneas y es el
archivo más grande del backend.

## Destinos

Todos **hardcodeados**, ninguno proviene de entrada del usuario: `graphql.anilist.co`,
`api.jikan.moe`, `animeav1.com`, `tioanime.com`, `www3.animeflv.net`, `jkanime.net`.
Esa es la razón por la que aquí no hay superficie SSRF.

## Controles

- Timeouts de 8–10 s en todas las llamadas salientes (`scraper.ts:284,396,670,860,928`).
- Reintentos con backoff exponencial respetando `Retry-After` (`:385-419`).
- `maxRedirects: 0` en AniList (`:397`).
- Rate limit configurable por fuente en base de datos (`routes/scrapingRepository.ts:7-18`) con
  piso `MASSIVE_SYNC_MIN_DELAY_MS` (`scrapingRoutes.ts:82-86`).
- `jobTracker.isRunning()` impide sincronizaciones concurrentes (`scrapingRoutes.ts:73-78`).
- Cache TTL 30 s en `routes/libraryCache.ts:4-23`; sitemap 60 s.

## Regla de identidad

Nunca aceptar un episodio solo por coincidencia parcial de texto. Se valida título, año,
temporada, slug e identidad de proveedor. Las coincidencias ambiguas se descartan.
Ver [[INC-001-animeav1-temporada-cruzada]] y [[INC-002-urls-invalidas-fuentes]].

## Enlaces

- [[backend-seguridad]] · [[INC-003-scraping-bloqueaba-ui]]
