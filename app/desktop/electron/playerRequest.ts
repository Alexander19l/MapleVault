export interface PlayerOpenRequest {
  url?: unknown;
  title?: unknown;
  server?: unknown;
  referer?: unknown;
  mode?: unknown;
}

export type PlayerWindowMode = 'embedded' | 'direct';

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

export function getSafePlayerReferer(value: unknown): string | null {
  return getSafePlayerUrl(value);
}

export function getSafePlayerWindowMode(value: unknown): PlayerWindowMode {
  return value === 'direct' ? 'direct' : 'embedded';
}

export function sanitizePlayerLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const sanitized = value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 100);
  return sanitized || fallback;
}
