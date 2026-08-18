---
tags: [seguridad, hallazgo, backend, aceptado]
severidad: baja
confianza: confirmado
actualizado: 2026-08-17
---

# S2 · La autenticación se desactiva sin MAPLEVAULT_API_TOKEN

**Severidad: baja / informativo.** Bajada desde "alta" tras verificar la cadena completa. Se
documenta como *trade-off aceptado*, no como defecto pendiente.

## El mecanismo

`security/sessionAuth.ts:16`:

```
if (!expectedToken || req.method === 'OPTIONS' || req.path === '/health' || ...) { next(); }
```

Con el token vacío, el middleware deja pasar todo.

## Por qué no es un defecto de producción

`main.ts:56-58`:

```
const BACKEND_SESSION_TOKEN = isDev
  ? process.env.MAPLEVAULT_API_TOKEN || ''
  : crypto.randomBytes(32).toString('hex');
```

En la app empaquetada —la que reciben los usuarios— `isDev` es `false`, así que el token es
**siempre** un valor aleatorio de 32 bytes por sesión. Nunca vacío. El único camino al token
vacío es `npm run dev` sin definir la variable.

Incluso en ese caso: el servidor solo escucha en `127.0.0.1` (`server.ts:29`), y `corsPolicy.ts`
restringe los orígenes de navegador a puertos loopback de desarrollo, `file://` y
`vscode-webview://` — un sitio web arbitrario no alcanza la API por `fetch`.

## Riesgo residual

Exclusivo del flujo de desarrollo local. Requiere que otro proceso en la misma máquina llegue a
`127.0.0.1:PORT` directamente: malware ya presente, u otra sesión de usuario en máquina
compartida.

## Mejora opcional

Que el backend rechace arrancar, o registre una advertencia visible, si `NODE_ENV` no es
`development` y el token está vacío. Es una guardia contra que un futuro cambio de despliegue
reproduzca sin querer el escenario "producción sin token".

## Enlaces

- [[backend-seguridad]] · [[ADR-003-puerto-dinamico-token-sesion]] · [[ADR-001-local-first]]
