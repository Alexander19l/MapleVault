---
tags: [incidente, manga, seguridad, resuelto]
actualizado: 2026-08-17
---

# INC-006 · Las páginas del lector no cargaban

## Síntoma

El lector abría un capítulo y mostraba páginas vacías, aunque la lista de páginas llegara
correctamente.

## Causas, encadenadas

1. Cargar las imágenes directamente desde la CDN del proveedor falla por la cabecera `Referer`.
2. Al introducir el proxy firmado, Chromium bloqueaba **igualmente** todas las imágenes: la CSP
   del frontend no permitía cargar desde el backend loopback, así que la firma válida daba igual.
3. Las firmas iniciales caducaban demasiado pronto para una sesión de lectura con carga diferida.

## Corrección

- Proxy firmado con HMAC y allowlist → [[ADR-002-proxy-firmado-paginas]].
- CSP ampliada para aceptar imágenes desde `localhost:*` y `127.0.0.1:*`, y **solo** desde ahí.
- Expiración de firma subida a 2 horas para que el modo continuo no venza a media lectura.

## Diagnóstico cuando vuelva a ocurrir

1. `GET /manga/online/chapters/<id>/pages` debe responder `200` con URLs absolutas.
2. La URL debe contener `provider`, `url`, `exp` y `sig`.
3. Abrirla debe dar `200` y `Content-Type: image/jpeg|png|webp`.
4. `403` significa firma expirada o alterada.
5. `502` significa que la CDN rechazó, agotó el timeout o devolvió un MIME no visual.
6. Si faltan capítulos antiguos, comprobar que la respuesta remota pagina con `offset=100`,
   `offset=200`… No aumentar el límite de una sola petición.

## Lo que NO se debe hacer

Desactivar la allowlist, aceptar HTTP, quitar la comprobación MIME o cargar URLs arbitrarias.
Cualquiera de esas cuatro "soluciones" convierte el proxy en un SSRF abierto.

## Enlaces

- [[backend-manga]] · [[ADR-002-proxy-firmado-paginas]] · [[v1.0.19-lector-online-feed-sinopsis]]
