import { beforeEach, describe, expect, it } from 'vitest';
import {
  findPlayerRequestReferer,
  resetPlayerRequestContexts,
  setPlayerRequestContext
} from '../../../desktop/electron/playerRequestContext';

const EPISODE_REFERER = 'https://animeav1.com/media/yomi-no-tsugai/4';
const HLS_URL = 'https://player.zilla-networks.com/play/abc123';
const MEGA_URL = 'https://mega.nz/embed/abc123';

describe('desktop player request context', () => {
  beforeEach(() => {
    resetPlayerRequestContexts();
  });

  it('devuelve el Referer del contexto cuyo origen coincide con la petición', () => {
    setPlayerRequestContext('window', { targetUrl: HLS_URL, referer: EPISODE_REFERER });

    expect(findPlayerRequestReferer(HLS_URL)).toBe(EPISODE_REFERER);
    // Otro recurso del mismo origen (el propio reproductor navegando dentro de su host).
    expect(findPlayerRequestReferer('https://player.zilla-networks.com/assets/app.js')).toBe(EPISODE_REFERER);
    // Origen ajeno: no se suplanta nada, para no romper el CDN de otro servidor.
    expect(findPlayerRequestReferer('https://cdn.otro-host.com/segment.ts')).toBeNull();
  });

  it('no suplanta Referer cuando no hay ningún contexto activo', () => {
    expect(findPlayerRequestReferer(HLS_URL)).toBeNull();
  });

  it('ignora URLs malformadas sin lanzar', () => {
    setPlayerRequestContext('window', { targetUrl: HLS_URL, referer: EPISODE_REFERER });

    expect(findPlayerRequestReferer('no-es-una-url')).toBeNull();
  });

  it('el desmontaje del panel embebido NO borra el Referer de la ventana propia', () => {
    // Regresión: al elegir un servidor de ventana propia (HLS), el panel embebido se
    // desmonta de forma asíncrona a la vez que la ventana se abre. Antes ambos compartían
    // un único contexto global, así que el desmontaje —que termina después— borraba el
    // Referer recién fijado por la ventana. El iframe salía entonces sin Referer y
    // Cloudflare respondía 403 (con X-Frame-Options), que Chromium reporta como
    // net::ERR_BLOCKED_BY_RESPONSE y el capítulo se queda en negro.
    setPlayerRequestContext('view', { targetUrl: MEGA_URL, referer: EPISODE_REFERER });
    setPlayerRequestContext('window', { targetUrl: HLS_URL, referer: EPISODE_REFERER });

    // El panel embebido termina de desmontarse *después* de que la ventana fijó el suyo.
    setPlayerRequestContext('view', null);

    expect(findPlayerRequestReferer(HLS_URL)).toBe(EPISODE_REFERER);
  });

  it('cada superficie limpia solo su propio contexto', () => {
    setPlayerRequestContext('view', { targetUrl: MEGA_URL, referer: EPISODE_REFERER });
    setPlayerRequestContext('window', { targetUrl: HLS_URL, referer: EPISODE_REFERER });

    setPlayerRequestContext('window', null);

    expect(findPlayerRequestReferer(HLS_URL)).toBeNull();
    expect(findPlayerRequestReferer(MEGA_URL)).toBe(EPISODE_REFERER);
  });
});
