/**
 * Referer que debe llevar la navegación inicial del reproductor, guardado por superficie.
 *
 * Hay dos superficies independientes que pueden pedir reproducción —el panel embebido
 * ('view') y la ventana propia ('window')— y ambas conviven durante el cambio de una a
 * otra: al elegir un servidor que va en ventana propia, el panel se desmonta (operación
 * asíncrona, espera a navegar a about:blank) mientras la ventana ya se está abriendo.
 *
 * Con un único contexto global compartido, el desmontaje del panel terminaba *después* de
 * que la ventana hubiera fijado el suyo y lo borraba. El iframe salía entonces sin Referer,
 * y los hosts con anti-hotlinking detrás de Cloudflare (zilla-networks, el servidor "HLS"
 * de AnimeAV1) respondían 403. Como ese 403 de Cloudflare incluye X-Frame-Options:
 * SAMEORIGIN, Chromium se negaba a mostrarlo dentro del iframe y lo reportaba como
 * net::ERR_BLOCKED_BY_RESPONSE — un síntoma que parecía una política de embedding del host
 * cuando en realidad era una carrera dentro de MapleVault.
 *
 * Guardarlo por dueño hace que cada superficie solo pueda limpiar el suyo.
 */

export type PlayerRequestOwner = 'view' | 'window';

export interface PlayerRequestContext {
  targetUrl: string;
  referer: string;
}

const playerRequestContexts = new Map<PlayerRequestOwner, PlayerRequestContext>();

export function setPlayerRequestContext(
  owner: PlayerRequestOwner,
  context: PlayerRequestContext | null
): void {
  if (context) {
    playerRequestContexts.set(owner, context);
  } else {
    playerRequestContexts.delete(owner);
  }
}

/**
 * Referer que corresponde a una petición, buscando entre los contextos activos el que
 * apunta al mismo origen. Devuelve null si ninguno coincide: en ese caso la cabecera no se
 * toca, porque suplantar el Referer de una petición ajena al reproductor rompe otros CDNs.
 */
export function findPlayerRequestReferer(requestUrl: string): string | null {
  let requestedOrigin: string;
  try {
    requestedOrigin = new URL(requestUrl).origin;
  } catch {
    return null;
  }

  for (const context of playerRequestContexts.values()) {
    try {
      if (new URL(context.targetUrl).origin === requestedOrigin) return context.referer;
    } catch {
      // La validación de entrada ya rechazó URLs malformadas; ignorar la entrada corrupta.
    }
  }
  return null;
}

/** Solo para pruebas: deja el registro sin contextos activos. */
export function resetPlayerRequestContexts(): void {
  playerRequestContexts.clear();
}
