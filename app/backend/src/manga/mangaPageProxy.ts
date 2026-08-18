import crypto from 'crypto';

const PROXY_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_URL_LENGTH = 4096;
const SECRET = process.env.MAPLEVAULT_API_TOKEN || crypto.randomBytes(32).toString('hex');

const ALLOWED_HOSTS: Record<string, (host: string) => boolean> = {
  mangadex: host => host === 'uploads.mangadex.org' || host.endsWith('.mangadex.network'),
  zonatmo: host => host === 'zonatmo.org' || host.endsWith('.zonatmo.org'),
  shademanga: host => host === 'cdn.shademanga.com'
};

function encode(value: string): string { return Buffer.from(value, 'utf8').toString('base64url'); }

function decode(value: string): string | null {
  try { return Buffer.from(value, 'base64url').toString('utf8'); } catch { return null; }
}

export function validateMangaPageUrl(providerId: string, value: string): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(value);
    const allowed = ALLOWED_HOSTS[providerId];
    if (parsed.protocol !== 'https:' || !allowed?.(parsed.hostname.toLowerCase()) || parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch { return null; }
}

export function createMangaPageProxyPath(providerId: string, pageUrl: string): string | null {
  const safeUrl = validateMangaPageUrl(providerId, pageUrl);
  if (!safeUrl) return null;
  const expires = Date.now() + PROXY_TTL_MS;
  const encodedUrl = encode(safeUrl);
  const payload = `${providerId}.${encodedUrl}.${expires}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `/manga/online/page-proxy?provider=${encodeURIComponent(providerId)}&url=${encodeURIComponent(encodedUrl)}&exp=${expires}&sig=${encodeURIComponent(signature)}`;
}

export function verifyMangaPageProxy(providerId: string, encodedUrl: string, expiresValue: string, signature: string): string | null {
  const expires = Number(expiresValue);
  const safeUrl = decode(encodedUrl);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || !safeUrl) return null;
  const payload = `${providerId}.${encodedUrl}.${expires}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  return validateMangaPageUrl(providerId, safeUrl);
}
