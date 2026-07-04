import { describe, expect, it } from 'vitest';
import { extractAnimeAV1MediaDataFromHtml } from '../scraper';

describe('respaldo HTML de episodios de AnimeAV1', () => {
  it('extrae, deduplica y ordena capítulos desde enlaces de la ficha', () => {
    const media = extractAnimeAV1MediaDataFromHtml(`
      <html>
        <head>
          <meta property="og:title" content="Título alternativo" />
        </head>
        <body>
          <h1>Super no Ura de Yani Suu Futari Mini</h1>
          <a href="/media/super-no-ura-de-yani-suu-futari/12">Capítulo 12</a>
          <a href="/media/super-no-ura-de-yani-suu-futari/1">Capítulo 1</a>
          <a href="/media/super-no-ura-de-yani-suu-futari/1">Capítulo 1 repetido</a>
          <a href="/media/otra-serie/2">Otra serie</a>
        </body>
      </html>
    `, 'super-no-ura-de-yani-suu-futari');

    expect(media.title).toBe('Super no Ura de Yani Suu Futari Mini');
    expect(media.episodes).toEqual([
      { id: 1, number: 1 },
      { id: 12, number: 12 }
    ]);
    expect(media.declaredEpisodesCount).toBe(2);
    expect(media.extractionSource).toBe('html');
  });
});
