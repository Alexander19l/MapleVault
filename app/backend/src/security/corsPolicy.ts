const TRUSTED_HTTP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
]);

export function isAllowedCorsOrigin(
  origin: string | undefined,
  hasSessionToken: boolean
): boolean {
  if (!origin) return true;
  if (TRUSTED_HTTP_ORIGINS.has(origin)) return true;
  if (origin.startsWith('file://') || origin.startsWith('vscode-webview://')) return true;

  // Chromium serializa los orígenes file:// como "null" en algunas versiones.
  // Solo se admite para la aplicación empaquetada, que usa un token aleatorio.
  return origin === 'null' && hasSessionToken;
}
