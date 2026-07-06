export interface PlayerOpenRequest {
  url?: unknown;
  title?: unknown;
  server?: unknown;
}

export function getSafePlayerUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizePlayerLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const sanitized = value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 100);
  return sanitized || fallback;
}
