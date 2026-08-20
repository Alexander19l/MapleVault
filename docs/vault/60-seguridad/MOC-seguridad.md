---
tags: [moc, indice, seguridad]
actualizado: 2026-08-17
---

# MOC · Seguridad

Auditoría estática del 2026-08-17. Volver a [[MOC-MapleVault]].

## Lo que está bien, y conviene decirlo primero

El modelo de amenaza local-first está bien ejecutado:

- Bind a `127.0.0.1` en ambos extremos; token de sesión de 32 bytes por arranque entregado solo
  por IPC; puerto dinámico → [[ADR-003-puerto-dinamico-token-sesion]].
- `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true` en las **cuatro** ventanas;
  el contenido remoto corre sin preload y en partición aislada → [[desktop-electron]].
- Allowlists explícitas de canales IPC, con rechazo por defecto.
- Proxy de páginas con HMAC **más** re-validación de host tras decodificar: filtrar el secreto no
  da SSRF arbitrario → [[ADR-002-proxy-firmado-paginas]].
- Confirmación de escrituras del asistente con validación de tipo de acción y sustitución del
  payload → [[ADR-004-confirmacion-token-chatbot]].
- Todas las queries SQL parametrizadas; las interpolaciones son de estructura y están tras
  allowlist → [[backend-base-de-datos]].
- Módulo `security/` con cobertura de tests 1:1.

## Hallazgos

| ID | Hallazgo | Severidad | Confianza |
|---|---|---|---|
| [[S1-clear-sin-confirmacion]] | Operaciones destructivas REST sin confirmación | media | confirmado |
| [[S4-sin-versionado-esquema]] | Sin versionado de esquema de base de datos | media | confirmado |
| [[S5-errores-silenciados-rutas]] | Errores tragados y sin handler global | media | confirmado |
| [[S6-axios-vulnerable]] | axios vulnerable como dependencia directa | media | confirmado |
| [[S2-auth-desactivada-sin-token]] | Auth desactivada sin token (solo en dev) | baja | confirmado |
| [[S3-validatesafepath-muerto]] | `validateSafePath` sin llamadores | baja | confirmado |
| [[S7-rate-limit-presets-sin-cablear]] | Dos presets de rate limit sin cablear | baja | confirmado |
| [[S8-shell-open-defensa-superficial]] | Validación de extensión solo en el preload | baja | confirmado |

**Ningún hallazgo crítico ni alto.**

## Dos severidades que se bajaron

S1 y S2 se plantearon inicialmente como *altas* y bajaron al trazar el flujo completo:

- **S1** → media: la comparación estricta `=== false` impide la escalada por confusión de tipos, y
  quien tenga el token ya puede causar daño equivalente por otras rutas.
- **S2** → baja: en la app empaquetada el token **siempre** es aleatorio; el escenario de token
  vacío es exclusivo de `npm run dev`, contenido por el bind a loopback y por CORS.

Se registra el cambio para que no se reintroduzcan como altas en una revisión futura.

## Alcance

Auditoría **estática**. No se arrancó la aplicación, no se probaron endpoints en vivo, no se
ejecutó ningún exploit y no se leyó ningún secreto. Las pruebas dinámicas quedan pendientes.

Ver también `docs/SECURITY_AUDIT.md`, que es la versión publicable de este mismo material.
