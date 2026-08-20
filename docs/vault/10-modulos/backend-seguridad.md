---
tags: [modulo, backend, seguridad, critico]
estado: estable
actualizado: 2026-08-17
---

# Backend · Módulo de seguridad

Cinco módulos productivos con cobertura de tests 1:1 (`src/security/__tests__/`). Es la
concentración de controles del backend.

**Directorio:** `app/backend/src/security/`

## Componentes

**`sessionAuth.ts`** — única barrera de autenticación. Cabecera `x-maplevault-token`, comparación
con `crypto.timingSafeEqual` previo chequeo de longitud (`:6-10`). Exenciones permanentes:
`OPTIONS`, `/health` y `/manga/online/page-proxy` (`:16`). Ver [[S2-auth-desactivada-sin-token]].

**`corsPolicy.ts`** — allowlist de loopback `5173-5179` y `5000`, más `file://` y
`vscode-webview://` (`:1-31`). Devuelve `true` si `origin` es undefined (`:29`), así que un
cliente sin cabecera `Origin` no queda filtrado por CORS — la barrera real es el token.

**`rateLimiter.ts`** — store en memoria con limpieza cada 60 s. Presets: `general` 500/min,
`scraping` 20/min, `chat` 30/min, `search` 50/10 s (`:93-102`). Solo `general` y `chat` están
cableados → [[S7-rate-limit-presets-sin-cablear]]. Clave sin IP por diseño:
[[ADR-007-rate-limit-por-ruta]].

**`sanitize.ts`** — `sanitizePlainText`, `sanitizeSynopsis` (allowlist de tags), `stripAllHtml`,
`sanitizeExternalAnime`, `sanitizeChatInput`, `sanitizeChatResponse`, `maskSensitiveData`.
Consumido por [[backend-chatbot]] y la normalización de anime.

**`validators.ts`** — validación centralizada, importada por 11 módulos. `validateImageUrl`
bloquea IP privadas (`:307-317`) pero acepta cualquier dominio público por decisión explícita
(`:324-326`). `validateLocalServiceUrl` (`:332`) es la defensa SSRF de los servicios
configurables. `validateSafePath` (`:376`) no tiene llamadores →
[[S3-validatesafepath-muerto]].

## Enlaces

- [[backend-server]] · [[backend-manga]] · [[backend-chatbot]]
- [[S1-clear-sin-confirmacion]] · [[ADR-002-proxy-firmado-paginas]]
