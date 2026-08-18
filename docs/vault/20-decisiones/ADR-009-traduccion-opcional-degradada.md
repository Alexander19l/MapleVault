---
tags: [decision, traduccion]
estado: vigente
actualizado: 2026-08-17
---

# ADR-009 · LibreTranslate opcional con degradación silenciosa

## Contexto

La traducción inglés-español mejora mucho la experiencia, pero LibreTranslate pesa: requiere
Python, un módulo y modelos descargados. Hacerlo obligatorio habría multiplicado el tamaño del
instalador y los modos de fallo en la instalación.

## Decisión

Es **opcional** y su ausencia nunca bloquea nada. El runtime debe:

- detectar la instalación automáticamente;
- arrancar sin bloquear la apertura de MapleVault;
- usar timeout y caer al texto original;
- no mostrar errores técnicos al usuario;
- cachear traducciones en `anime_translations` para no repetir solicitudes;
- registrar disponibilidad sin filtrar claves.

Si no está disponible, el producto funciona y marca claramente que el dato traducido no está.

## Consecuencia

Cualquier código que consuma traducción debe tratar el texto original como resultado válido, no
como error. Ver [[INC-004-libretranslate-arranque]], que es el incidente que motivó endurecer
esta regla.

La URL del servicio es configurable por el usuario, así que pasa por `validateLocalServiceUrl`
con `maxRedirects: 0` — es una de las dos salidas de red con destino no hardcodeado.

## Enlaces

- [[backend-traduccion]] · [[backend-seguridad]] · [[INC-004-libretranslate-arranque]]
