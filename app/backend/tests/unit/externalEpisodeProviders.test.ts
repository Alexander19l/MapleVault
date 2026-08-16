import { describe, expect, it } from 'vitest';
import {
  parseAniwatchEpisodes,
  parseAniwatchServers,
  parseAniwavesEpisodes,
  getExternalServerPlaybackMode,
  parseWordPressEpisodes,
  parseWordPressServers
} from '../../src/episodes/externalEpisodeProviders';

describe('external episode provider parsers', () => {
  it('extrae y ordena episodios de páginas WordPress sin mezclar enlaces laterales', () => {
    const episodes = parseWordPressEpisodes(`
      <div class="eplister"><ul>
        <li><a href="/maple-show-episode-2-english-subbed/">Episode 2</a></li>
        <li><a href="/maple-show-episode-1-english-subbed/">Episode 1</a></li>
        <li><a href="/maple-show-episode-1-english-subbed/">Episode 1</a></li>
        <li><a href="https://malicious.example/maple-show-episode-3/">Episode 3</a></li>
      </ul></div>
      <aside><a href="/another-show-episode-99/">Episode 99</a></aside>
    `, 'https://gogoanime.by', 'maple-show');

    expect(episodes.map(episode => episode.number)).toEqual([1, 2]);
    expect(episodes[0].url).toBe('https://gogoanime.by/maple-show-episode-1-english-subbed/');
  });

  it('recoge reproductores públicos y descarta protocolos no permitidos', () => {
    const servers = parseWordPressServers(`
      <li class="player-type-link" data-type="Mega" data-src="/player/?id=1"></li>
      <iframe src="https://video.example/embed/2"></iframe>
      <iframe src="javascript:alert(1)"></iframe>
    `, 'https://gogoanime.by');

    expect(servers).toEqual([
      { server: 'Mega', url: 'https://gogoanime.by/player/?id=1' },
      { server: 'video', url: 'https://video.example/embed/2' }
    ]);
  });

  it('interpreta la lista AJAX de Aniwaves', () => {
    const episodes = parseAniwavesEpisodes(`
      <ul>
        <li><a data-num="2" href="/watch/55/ep-2" title="Segundo">2</a></li>
        <li><a data-num="1" href="/watch/55/ep-1" title="Primero">1</a></li>
      </ul>
    `, 'https://aniwaves.ru', '55');

    expect(episodes).toEqual([
      { id: '55:1', number: 1, title: 'Primero', url: 'https://aniwaves.ru/watch/55/ep-1' },
      { id: '55:2', number: 2, title: 'Segundo', url: 'https://aniwaves.ru/watch/55/ep-2' }
    ]);
  });

  it('separa hosts directos y descarta reproductores incompatibles con MapleVault', () => {
    expect(getExternalServerPlaybackMode('https://play.echovideo.ru/embed/1')).toBe('direct-window');
    expect(getExternalServerPlaybackMode('https://gn1r5n.org/e/1')).toBeNull();
    expect(getExternalServerPlaybackMode('https://myvidplay.com/e/1')).toBeNull();
    expect(getExternalServerPlaybackMode('https://video.example/embed/1')).toBe('window');
    expect(getExternalServerPlaybackMode('javascript:alert(1)')).toBeNull();
  });

  it('interpreta episodios y URLs base64 públicas de Aniwatch', () => {
    const episodes = parseAniwatchEpisodes(`
      <a class="ep-item" data-id="101" data-number="1" href="/maple-episode-1/">1 Inicio</a>
    `, 'https://aniwatch.co.at');
    const subUrl = Buffer.from('https://player.example/sub').toString('base64');
    const dubUrl = Buffer.from('https://player.example/dub').toString('base64');
    const servers = parseAniwatchServers(`
      <div class="ps_-block sub"><div class="server-item" data-server-name="VidSrc" data-hash="${subUrl}"></div></div>
      <div class="ps_-block dub"><div class="server-item" data-server-name="VidSrc" data-hash="${dubUrl}"></div></div>
    `);

    expect(episodes[0]).toMatchObject({ id: '101', number: 1 });
    expect(servers.SUB[0].url).toBe('https://player.example/sub');
    expect(servers.DUB[0].url).toBe('https://player.example/dub');
  });
});
