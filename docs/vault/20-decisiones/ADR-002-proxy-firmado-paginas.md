---
tags: [decision, seguridad, manga]
estado: vigente
actualizado: 2026-08-17
---

# ADR-002 · Proxy firmado para páginas de manga

## Contexto

El lector necesita mostrar imágenes alojadas en las CDN de los proveedores. Cargarlas directo
desde el navegador falla por `Referer` y por CSP. La alternativa obvia —un endpoint proxy que
acepte cualquier URL— es un SSRF abierto.

## Decisión

Las páginas se transforman en enlaces temporales firmados por `manga/mangaPageProxy.ts`.

Defensa en dos capas independientes:

1. **Firma** HMAC-SHA256 verificada con `timingSafeEqual` (`:36,48`) y expiración de 2 h (`:3,43`).
2. **Re-validación** del host contra allowlist más `https:` obligatorio **después** de decodificar
   (`:19-28,49`).

Más límites de respuesta: `content-type: image/*`, 15 s de timeout, 20 MB
(`mangaRoutes.ts:257-260`).

La ruta `/manga/online/page-proxy` está exenta del middleware de sesión (`sessionAuth.ts:16`)
porque un elemento `img` no puede enviar una cabecera HTTP; la firma temporal sustituye a esa
cabecera en este caso concreto.

## Por qué las dos capas

Si solo hubiera firma, filtrar el secreto daría SSRF arbitrario. Con la re-validación de host,
filtrar el secreto solo permite pedir imágenes a las CDN ya permitidas. Es la decisión que hace
que la exención de autenticación sea aceptable.

## No hacer

No convertir el proxy en ruta genérica. Ante un fallo de carga, **no** se debe desactivar la
allowlist, aceptar HTTP, quitar la comprobación MIME ni cargar URLs arbitrarias.
Ver [[INC-006-paginas-manga-no-cargaban]].

## Enlaces

- [[backend-manga]] · [[backend-seguridad]] · [[v1.0.19-lector-online-feed-sinopsis]]
