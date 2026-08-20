export type EpisodeSourceLanguage = 'es' | 'en';
export type PlaybackMode = 'inline' | 'window' | 'direct-window';

export interface PlaybackServer {
  server: string;
  url: string;
  providerId: string;
  language: EpisodeSourceLanguage;
  referer: string;
  playbackMode: PlaybackMode;
}

interface PlaybackServerContext {
  providerId: string;
  language: EpisodeSourceLanguage;
  referer: string;
  forceWindow?: boolean | ((serverName: string, url: string) => boolean);
}

/**
 * Servidores que no se reproducen dentro del panel embebido y sí lo hacen en una ventana
 * independiente. Se mantiene deliberadamente corta: solo los hosts en los que se ha
 * comprobado el problema. El resto (mp4upload, yourupload, etc.) sigue embebido, que es
 * la experiencia preferida.
 */
const STANDALONE_WINDOW_HOSTS = [
  'zilla-networks.com', // el servidor "HLS" de AnimeAV1
  'pixeldrain.com',     // "Pdrain"
  'voe.sx'              // Voe: su pantalla completa solo funciona en ventana propia
];

function matchesHost(hostname: string, domains: string[]): boolean {
  return domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function requiresStandaloneWindowPlayer(url: string): boolean {
  try {
    return matchesHost(new URL(url).hostname.toLowerCase(), STANDALONE_WINDOW_HOSTS);
  } catch {
    return false;
  }
}

function getSafeHttpUrl(value: unknown): string | null {
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

function normalizeServer(value: any, context: PlaybackServerContext): PlaybackServer | null {
  const url = getSafeHttpUrl(value?.url || value?.src);
  const referer = getSafeHttpUrl(context.referer);
  if (!url || !referer) return null;

  const server = String(value?.server || value?.name || 'Servidor').trim().slice(0, 80) || 'Servidor';
  const forceWindow = typeof context.forceWindow === 'function'
    ? context.forceWindow(server, url)
    : Boolean(context.forceWindow);
  const requestedMode = value?.playbackMode;
  const playbackMode: PlaybackMode = requestedMode === 'direct-window' || requestedMode === 'window'
    ? requestedMode
    : requiresStandaloneWindowPlayer(url) || forceWindow
      ? 'window'
      : 'inline';

  return {
    ...value,
    server,
    url,
    providerId: context.providerId,
    language: context.language,
    referer,
    playbackMode
  };
}

export function decoratePlaybackServers(value: any, context: PlaybackServerContext): any {
  if (Array.isArray(value)) {
    return value
      .map(server => normalizeServer(server, context))
      .filter((server): server is PlaybackServer => Boolean(server));
  }

  if (value && typeof value === 'object') {
    const decorated: Record<string, unknown> = {};
    for (const [key, servers] of Object.entries(value)) {
      decorated[key] = Array.isArray(servers)
        ? decoratePlaybackServers(servers, context)
        : servers;
    }
    return decorated;
  }

  return value;
}

/**
 * Respaldo por nombre para el servidor "HLS" de AnimeAV1, por si cambia de host.
 * mp4upload se retiró de esta lista: se reproduce correctamente embebido.
 */
export function requiresStandaloneAnimeAV1Player(serverName: string): boolean {
  return /(?:^|\s)hls(?:\s|$)/i.test(serverName);
}
