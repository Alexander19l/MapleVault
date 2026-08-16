import { describe, expect, it } from 'vitest';
import {
  decoratePlaybackServers,
  requiresStandaloneAnimeAV1Player
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
