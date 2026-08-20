---
tags: [moc, indice, decision]
actualizado: 2026-08-17
---

# MOC · Decisiones de arquitectura

Por qué las cosas son como son. Volver a [[MOC-MapleVault]].

Estas decisiones están **vigentes** salvo indicación contraria. Antes de contradecir una, léela:
casi todas tienen un incidente detrás.

| ADR | Decisión | Estado |
|---|---|---|
| [[ADR-001-local-first]] | Aplicación local-first, sin backend público | vigente |
| [[ADR-002-proxy-firmado-paginas]] | Proxy firmado con doble validación para páginas de manga | vigente |
| [[ADR-003-puerto-dinamico-token-sesion]] | Puerto dinámico y token de sesión por arranque | vigente |
| [[ADR-004-confirmacion-token-chatbot]] | Toda escritura del asistente requiere confirmación | vigente |
| [[ADR-005-sin-router-estado-en-app]] | Sin router; estado global en `App.tsx` | **revisar** |
| [[ADR-006-cola-serie-sqlite]] | Cola serie para todas las operaciones SQLite | vigente |
| [[ADR-007-rate-limit-por-ruta]] | Rate limit por ruta, sin discriminar cliente | vigente |
| [[ADR-008-idiomas-manga-restringidos]] | Solo `es`, `es-la` y `en`; `es-la` se normaliza | vigente |
| [[ADR-009-traduccion-opcional-degradada]] | LibreTranslate opcional, degradación silenciosa | vigente |
| [[ADR-010-lector-sin-deteccion-paneles]] | El lector no infiere paneles | vigente |

## La que hay que revisar

[[ADR-005-sin-router-estado-en-app]] es la única marcada como *revisar*. La decisión era razonable
—no hay URLs que compartir en Electron— pero sus consecuencias ya se están cobrando:
[[BUG-busqueda-superior-inerte]], [[DEUDA-sin-cache-ni-abort]] y [[DEUDA-zustand-sin-usar]]
salen todas de ahí.

## Decisiones que NO son defectos

[[ADR-007-rate-limit-por-ruta]] se documenta expresamente para que una auditoría futura no la
reporte como hallazgo: la clave sin IP es deliberada en una app de un solo cliente local.
