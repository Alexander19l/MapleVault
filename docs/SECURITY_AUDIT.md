# MapleVault — Auditoría de seguridad

**Fecha:** 2026-08-17 · **Versión auditada:** 1.0.19 · **Alcance:** auditoría estática de código,
configuración y flujos de datos. Sin ejecución, sin exploits, sin lectura de secretos.

Sustituye a la versión del 2026-06-25, que quedó obsoleta 35 commits atrás — antes de todo el
trabajo de manga, proxy firmado, CSP y lectura offline.

El material completo, nota a nota, está en `docs/vault/60-seguridad/`.

---

## Resultado

**Ningún hallazgo crítico ni alto.** Cuatro de severidad media y cuatro de severidad baja.

El modelo de amenaza local-first está bien ejecutado. Conviene decirlo antes de la lista de
hallazgos, porque cambia cómo leerla.

## Controles verificados

Cada uno comprobado en el código, no asumido de la documentación.

### Red y autenticación

- Bind a `127.0.0.1` en ambos extremos: `server.ts:29` y `main.ts:52`.
- Puerto reservado dinámicamente en producción antes de arrancar: `main.ts:207-227`.
- Token de sesión de 32 bytes generado por arranque: `main.ts:56-58`; entregado al renderer solo
  por IPC (`main.ts:485-488`), nunca presente en el bundle.
- Comparación del token con `crypto.timingSafeEqual` previa igualación de longitud:
  `sessionAuth.ts:6-10`.
- `MAPLEVAULT_INSTANCE_ID` verificado en el healthcheck: `main.ts:362-367`.
- CORS con allowlist de puertos loopback: `corsPolicy.ts:1-31`.
- Límite de payload de 2 MB en JSON y urlencoded: `server.ts:44-45`.
- Rate limit general activo: `server.ts:60`; específico de chat: `assistantRoutes.ts:69`.
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, y `X-Powered-By`
  eliminado: `server.ts:48-54`.

### Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` en las **cuatro** ventanas:
  `main.ts:393-398`, `main.ts:87-106`, `launcher.ts:20-25`, `launcher.ts:118-123`.
- `webSecurity` sin sobrescribir en ningún punto: queda en el default seguro.
- El contenido remoto (reproductor) corre **sin preload** y en partición de sesión aislada:
  `main.ts:99-105`.
- `contextBridge` en ambos preloads; `ipcRenderer` nunca se expone crudo.
- Allowlists de canales IPC: 3 de `send` (`preload.ts:44-48`) y 16 de `invoke` (`:51-68`), con
  rechazo por defecto (`:182-196`).
- URLs externas restringidas a `http:`/`https:` (`preload.ts:34-41`); lista negra de 25
  extensiones peligrosas (`:13-18`).
- Popups denegados y navegación externa bloqueada: `playerProtection.ts:302-320`.

### Datos y entrada

- Todas las queries SQL parametrizadas. Las interpolaciones existentes son de **estructura**, no
  de valores, y están tras allowlist: `episodeRepository.ts:7-18`, `mangaRepository.ts:30-34`.
- Validación centralizada en `security/validators.ts`, importada por 11 módulos.
- `validateLocalServiceUrl` contiene las dos salidas de red con destino configurable por el
  usuario (IA y traducción), con `maxRedirects: 0`.
- Saneado de contenido externo y de mensajes del chatbot: `security/sanitize.ts`.
- Enmascarado de datos sensibles en logs: `maskSensitiveData`.
- Restauración de backups con validación de path (`path.relative` + `realpathSync`),
  `PRAGMA integrity_check`, `foreign_key_check` y backup de emergencia con rollback:
  `backup.ts:170-229`.
- Almacenamiento offline con sanitizado de ruta, contención bajo la raíz, tope de 256 MB y 500
  páginas, y rechazo de ZIP inválidos antes de crear carpeta: `mangaOfflineStorage.ts:6-43`.

### Proxy de páginas de manga

La pieza mejor resuelta. Defensa en dos capas independientes:

1. Firma HMAC-SHA256 verificada con `timingSafeEqual`, expiración de 2 h:
   `mangaPageProxy.ts:36,48,3,43`.
2. Re-validación del host contra allowlist y `https:` obligatorio **tras decodificar**:
   `mangaPageProxy.ts:19-28,49`.

Más límites de respuesta: `content-type: image/*`, 15 s, 20 MB (`mangaRoutes.ts:257-260`).

Consecuencia: aunque se filtrara el secreto de firma, no se obtiene SSRF arbitrario.

### Acciones del asistente

Confirmación de un solo uso con TTL de 5 min (`actionConfirmation.ts:20,40,71`). La verificación
además **valida que el tipo de acción coincida** (`actionExecutor.ts:99`) y **sustituye
`actionData` por la registrada en el token** (`:103`), de modo que el payload confirmado no se
puede alterar en la llamada de ejecución. Las 11 acciones de escritura la exigen sin excepción.

---

## Hallazgos

| ID | Hallazgo | Severidad | Confianza |
|---|---|---|---|
| S1 | Operaciones destructivas REST sin confirmación de servidor | media | confirmado |
| S4 | Sin versionado de esquema de base de datos | media | confirmado |
| S5 | Errores silenciados en rutas y sin handler global | media | confirmado |
| S6 | `axios` vulnerable como dependencia directa | media | confirmado |
| S2 | Autenticación desactivada sin token (solo en desarrollo) | baja | confirmado |
| S3 | `validateSafePath` sin llamadores productivos | baja | confirmado |
| S7 | Dos presets de rate limit definidos y no cableados | baja | confirmado |
| S8 | Validación de extensión solo en el preload | baja | confirmado |

Detalle completo, flujo source→sink y corrección propuesta: `docs/vault/60-seguridad/`.

### S1 — el más relevante

`POST /anime/clear` (`libraryRoutes.ts:244-262`) borra el catálogo tomando `keepUserList` del
body sin validar tipo y sin confirmación de servidor. El patrón se repite en `DELETE /anime/:id`,
`DELETE /user-list/:id` y `POST /backup/restore`.

La asimetría es que la misma clase de operación **sí** exige confirmación por la vía del chatbot.

Atenuantes reales: la comparación estricta `=== false` impide escalada por confusión de tipos; la
ruta está tras el middleware de sesión; el frontend antepone un `showConfirm()`; hay backups
automáticos; y quien ya tenga el token puede causar daño equivalente por otras rutas.

**Corrección:** aplicar el flujo de `confirmToken` que ya existe en `actionExecutor.ts:85-103`.

---

## Riesgos residuales aceptados

Se documentan para que una revisión futura no los reporte como hallazgos nuevos.

1. **Rate limit sin discriminar cliente.** La clave es `${limitKey}:${req.path}`
   (`rateLimiter.ts:111`), sin IP. Es deliberado y está comentado en el código: en una app local
   el cliente es siempre el mismo. No aporta defensa DoS multi-cliente y no pretende hacerlo.
2. **Autenticación desactivada en desarrollo.** En la app empaquetada el token es siempre
   aleatorio (`main.ts:56-58`); el escenario de token vacío es exclusivo de `npm run dev`,
   contenido por el bind a loopback y por CORS.
3. **Scraping dependiente de HTML externo.** ZonaTMO y ShadeManga se rompen si cambia su marcado.
   Mitigado con fixtures versionados y degradación sin bloquear la interfaz.
4. **Iframes de reproductores externos.** Siguen siendo superficie de riesgo; se mantienen
   aislados en partición propia, sin preload, con adblock y sin descargas.
5. **Instalador sin firma digital.** SmartScreen advierte. Firmarlo requiere un certificado.

## Dependencias

`npm audit` del 2026-08-17:

| Raíz | Total | Crítica | Alta |
|---|---:|---:|---:|
| `/` | 8 | 1 | 6 |
| `app/backend` | 7 | 1 | 5 |
| `app/frontend` | 4 | 0 | 4 |

`axios` es la **única directa** y está en el camino real de datos. El resto (`tar`, `undici`,
`brace-expansion`, `nanoid`, `postcss`, `js-yaml`, `shell-quote`, `fast-uri`) son transitivas de
la cadena de build.

No se aplicó ninguna corrección: modificar lockfiles requiere verificación propia.

## Recomendaciones, por orden

1. Aplicar `confirmToken` a las cuatro rutas destructivas (S1).
2. Actualizar `axios` de forma aislada y verificar el scraping (S6).
3. Introducir versionado de esquema con `PRAGMA user_version` (S4).
4. Sustituir los `catch (_)` mudos y añadir handler de errores y 404 (S5).
5. Configurar integración continua: hoy la verificación depende de que alguien se acuerde.
6. Resolver los tres elementos de código muerto del módulo de seguridad (S3, S7).

## Qué NO cubre esta auditoría

Pruebas dinámicas contra un backend en ejecución, revisión de la lógica de negocio del chatbot,
análisis de la cadena de suministro más allá de `npm audit`, y verificación del instalador
firmado. Ninguna se realizó.
