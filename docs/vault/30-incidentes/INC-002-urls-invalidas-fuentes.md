---
tags: [incidente, scraping, resuelto]
actualizado: 2026-08-17
---

# INC-002 · Fuentes devolvían URLs HLS o MP4 inválidas

## Síntoma

Una ficha contenía un enlace de reproducción, la aplicación lo ofrecía como episodio disponible,
y al reproducir no había nada: la URL estaba muerta o no era un flujo válido.

## Causa

Se asumía que la presencia de un enlace en el HTML de la ficha equivalía a disponibilidad. No es
cierto: las fuentes dejan enlaces obsoletos, placeholders y rutas que caducan.

## Regla permanente

**Nunca afirmar que un capítulo existe solo porque la ficha contiene un enlace.** La
disponibilidad debe verificarse, no inferirse del marcado.

## Relación con el proxy de manga

El mismo principio, aplicado a imágenes, es lo que justifica validar `content-type: image/*` en
la respuesta del proxy de páginas y no fiarse de la extensión de la URL →
[[ADR-002-proxy-firmado-paginas]].

## Enlaces

- [[backend-scraping-anime]] · [[INC-001-animeav1-temporada-cruzada]] · [[ADR-002-proxy-firmado-paginas]]
