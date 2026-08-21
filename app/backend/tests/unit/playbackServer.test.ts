import { describe, expect, it } from 'vitest';
import {
  decoratePlaybackServers,
  requiresDirectWindowPlayer,
  requiresStandaloneAnimeAV1Player,
  requiresStandaloneWindowPlayer
} from '../../src/episodes/playbackServer';

describe('playback server metadata', () => {
  it('agrega origen, idioma y Referer sin alterar las variantes', () => {
    const result = decoratePlaybackServers({
      SUB: [{ server: 'HLS', url: 'https://player.example/play/1' }]
    }, {
      providerId: 'animeav1',
      language: 'es',
      referer: 'https://animeav1.com/media/death-note/1',
      forceWindow: requiresStandaloneAnimeAV1Player
    });

    expect(result.SUB[0]).toMatchObject({
      server: 'HLS',
      providerId: 'animeav1',
      language: 'es',
      referer: 'https://animeav1.com/media/death-note/1',
      playbackMode: 'window'
    });
  });

  it('rechaza protocolos y credenciales que no son aptos para el reproductor', () => {
    const result = decoratePlaybackServers([
      { server: 'Local', url: 'file:///tmp/video.html' },
      { server: 'Credenciales', url: 'https://user:secret@example.com/embed' },
      { server: 'Seguro', url: 'https://example.com/embed' }
    ], {
      providerId: 'test',
      language: 'en',
      referer: 'https://source.example/episode/1'
    });

    expect(result).toHaveLength(1);
    expect(result[0].server).toBe('Seguro');
    expect(result[0].playbackMode).toBe('inline');
  });

  it('manda a ventana propia (con iframe o en modo directo) segun el host y deja el resto embebido', () => {
    const result = decoratePlaybackServers({
      SUB: [
        // Servidor "HLS" de AnimeAV1 (zilla-networks): va en ventana propia CON iframe.
        // Su bundle aborta con "Content not found." si detecta que no está embebido
        // (comprueba window.self !== window.top), así que el modo directo no sirve.
        { server: 'HLS', url: 'https://player.zilla-networks.com/play/abc123' },
        // Voe: su página de embed no bloquea el iframe, pero su pantalla completa solo
        // es fiable en ventana propia.
        { server: 'Voe', url: 'https://voe.sx/e/abc123' },
        // Estos sí funcionan dentro de la app y deben seguir embebidos.
        { server: 'MP4Upload', url: 'https://www.mp4upload.com/embed-abc123.html' },
        { server: 'YourUpload', url: 'https://www.yourupload.com/embed/abc123' }
      ]
    }, {
      providerId: 'animeav1',
      language: 'es',
      referer: 'https://animeav1.com/media/serie/1'
    });

    const modes = Object.fromEntries(
      result.SUB.map((server: { server: string; playbackMode: string }) => [server.server, server.playbackMode])
    );
    expect(modes).toEqual({
      HLS: 'window',
      Voe: 'window',
      MP4Upload: 'inline',
      YourUpload: 'inline'
    });
  });

  it('manda Pixeldrain ("PDrain") a ventana propia en modo directo, sin iframe', () => {
    // Verificado con datos reales, en dos pasos:
    // 1) La página /u/<id>?embed envía Content-Security-Policy: frame-ancestors 'self',
    //    que Chromium hace cumplir y bloquea cualquier iframe de otro origen (pantalla
    //    negra), pero esa cabecera solo restringe cuando se carga COMO iframe.
    // 2) Servir el archivo directo (/api/file/<id>) sin pasar por esa página falla con
    //    {"success":false,"value":"hotlink_detected"} incluso fijando su propio Referer:
    //    exige la sesión que solo se establece visitando la página real.
    // La solución verificada es navegar la ventana DIRECTO a la página de embed original
    // (modo 'direct-window', sin player.html/iframe de por medio) — igual que un navegador
    // normal, sin ese bloqueo.
    expect(requiresDirectWindowPlayer('https://pixeldrain.com/u/JvqHSxgE?embed')).toBe(true);
    expect(requiresDirectWindowPlayer('https://pixeldrain.com/u/JvqHSxgE')).toBe(true);
    expect(requiresDirectWindowPlayer('https://pixeldrain.com/api/file/JvqHSxgE')).toBe(true);
    expect(requiresDirectWindowPlayer('https://mp4upload.com/embed-abc.html')).toBe(false);

    const result = decoratePlaybackServers([
      { server: 'PDrain', url: 'https://pixeldrain.com/u/JvqHSxgE?embed' }
    ], {
      providerId: 'animeav1',
      language: 'es',
      referer: 'https://animeav1.com/media/serie/1'
    });

    expect(result[0]).toMatchObject({
      url: 'https://pixeldrain.com/u/JvqHSxgE?embed',
      playbackMode: 'direct-window'
    });
  });

  it('manda "HLS" (zilla-networks) a ventana propia CON iframe, nunca en modo directo', () => {
    // Verificado leyendo el JS que sirve el propio host: su bundle empieza con
    //   if (!(window.self !== window.top)) { document.body.innerHTML = "Content not found."; ... }
    // o sea, se niega a funcionar fuera de un iframe. Y su respuesta GET real (con
    // cabeceras de navegador) es 200 sin X-Frame-Options ni frame-ancestors, así que
    // embeberlo es legítimo. Por eso va a 'window' (player.html + iframe) y NO a
    // 'direct-window', que es justo lo que su comprobación rechaza.
    expect(requiresStandaloneWindowPlayer('https://player.zilla-networks.com/play/abc123')).toBe(true);
    expect(requiresStandaloneWindowPlayer('https://zilla-networks.com/play/abc123')).toBe(true);
    expect(requiresDirectWindowPlayer('https://player.zilla-networks.com/play/abc123')).toBe(false);

    const result = decoratePlaybackServers([
      { server: 'HLS', url: 'https://player.zilla-networks.com/play/abc123' }
    ], {
      providerId: 'animeav1',
      language: 'es',
      referer: 'https://animeav1.com/media/serie/1'
    });

    expect(result[0]).toMatchObject({
      url: 'https://player.zilla-networks.com/play/abc123',
      playbackMode: 'window'
    });
  });

  it('conserva el modo de ventana directa declarado por un adaptador verificado', () => {
    const result = decoratePlaybackServers([
      {
        server: 'Vidplay',
        url: 'https://player.example/embed/1',
        playbackMode: 'direct-window'
      }
    ], {
      providerId: 'test',
      language: 'en',
      referer: 'https://source.example/episode/1',
      forceWindow: true
    });

    expect(result[0].playbackMode).toBe('direct-window');
  });
});
