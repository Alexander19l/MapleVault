---
tags: [modulo, backend, traduccion]
estado: estable
actualizado: 2026-08-17
---

# Backend · Traducción

LibreTranslate local y opcional. El requisito duro es que **nunca bloquee el arranque**.

**Directorio:** `app/backend/src/translation/`

## Contrato de degradación

- Detecta la instalación automáticamente.
- Arranca sin bloquear la apertura de MapleVault.
- Usa timeout y cae al texto original si falla.
- No muestra errores técnicos al usuario.
- Cachea traducciones en `anime_translations` para no repetir solicitudes.

Si no está disponible, el producto sigue funcionando y marca claramente que el dato traducido
no está. Ver [[ADR-009-traduccion-opcional-degradada]] y [[INC-004-libretranslate-arranque]].

## Uso en manga

La ficha se traduce con `translateTextForAnime` usando la clave `manga:<proveedor>:<id>`.
Desde 1.0.19 la ficha siempre consulta detalles, así que la sinopsis de búsqueda ya no evita el
paso por LibreTranslate → [[v1.0.19-lector-online-feed-sinopsis]].

La URL del servicio es configurable por el usuario, y por eso pasa por `validateLocalServiceUrl`
con `maxRedirects: 0` (`translationService.ts:6,324-326`).

## Enlaces

- [[backend-manga]] · [[backend-seguridad]]
