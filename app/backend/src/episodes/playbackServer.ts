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
 * independiente, cargando la página de embed normal dentro de un iframe interno
 * (player.html). Se mantiene deliberadamente corta: solo los hosts en los que se ha
 * comprobado el problema. El resto (mp4upload, yourupload, etc.) sigue embebido, que es
 * la experiencia preferida.
 *
 * - "Voe": su pantalla completa solo es fiable en una ventana real del sistema. No tiene
 *   ningún problema de iframe: su página de embed no envía ninguna cabecera que lo
 *   restrinja.
 *
 * - "HLS" (zilla-networks): DEBE ir en iframe, nunca en navegación directa. Su propio
 *   bundle aborta en cuanto detecta que no está embebido; el código servido por el host
 *   es literalmente:
 *       if (!(window.self !== window.top)) { document.body.innerHTML = "Content not found."; ... }
 *   Es decir, la comprobación es del reproductor, no una cabecera HTTP: verificado leyendo
 *   el JS que sirve el propio host. Su respuesta GET no envía X-Frame-Options ni
 *   frame-ancestors, así que embeberlo es legítimo y es la única forma que funciona.
 *   (Si alguna vez falla con net::ERR_BLOCKED_BY_RESPONSE, es un 403 temporal de Cloudflare
 *   por exceso de peticiones seguidas: ese 403 sí lleva X-Frame-Options: SAMEORIGIN, y es
 *   esa cabecera del error —no la de la página— la que Chromium rechaza al enmarcarla. Se
 *   resuelve solo; no es una política de embedding del host.)
 */
const STANDALONE_WINDOW_HOSTS = ['voe.sx', 'zilla-networks.com'];

/**
 * Servidores que necesitan ventana propia navegando DIRECTO a su página (sin iframe
 * interno, modo 'direct-window').
 *
 * - Pixeldrain ("PDrain"): verificado con reproducción real (temporizador avanzando,
 *   contador de descarga subiendo). Su página de embed envía
 *   `Content-Security-Policy: frame-ancestors 'self'`, que solo restringe la carga COMO
 *   iframe; al navegar la ventana directo a esa misma URL el bloqueo no aplica y la
 *   página funciona igual que en un navegador normal. (Se intentó servir el archivo de
 *   video directo sin pasar por esta página: la API lo rechaza con "hotlink_detected"
 *   incluso fijando el Referer correcto, porque exige la sesión que solo se establece
 *   visitando la propia página de reproducción.)
 *
 * Este modo NO sirve para hosts que comprueban `window.self !== window.top` —como
 * zilla-networks—: esos necesitan iframe obligatoriamente (ver STANDALONE_WINDOW_HOSTS).
 */
const DIRECT_WINDOW_HOSTS = ['pixeldrain.com'];

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

export function requiresDirectWindowPlayer(url: string): boolean {
  try {
    return matchesHost(new URL(url).hostname.toLowerCase(), DIRECT_WINDOW_HOSTS);
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
    : requiresDirectWindowPlayer(url)
      ? 'direct-window'
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
