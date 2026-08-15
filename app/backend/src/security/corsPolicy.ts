const TRUSTED_HTTP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
]);

const DEV_FRONTEND_PORT_RANGE = { min: 5173, max: 5179 } as const;

function isTrustedLoopbackDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const isLoopback = parsed.protocol === 'http:'
      && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    const port = Number(parsed.port);
    return isLoopback
      && Number.isInteger(port)
      && port >= DEV_FRONTEND_PORT_RANGE.min
      && port <= DEV_FRONTEND_PORT_RANGE.max;
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  hasSessionToken: boolean
): boolean {
  if (!origin) return true;
  if (TRUSTED_HTTP_ORIGINS.has(origin) || isTrustedLoopbackDevOrigin(origin)) return true;
  if (origin.startsWith('file://') || origin.startsWith('vscode-webview://')) return true;

  // Chromium serializa los orígenes file:// como "null" en algunas versiones.
  // Solo se admite para la aplicación empaquetada, que usa un token aleatorio.
  return origin === 'null' && hasSessionToken;
}
