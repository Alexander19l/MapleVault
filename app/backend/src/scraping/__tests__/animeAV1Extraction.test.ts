import { describe, expect, it } from 'vitest';
import {
  extractAnimeAV1MediaData,
  extractAnimeAV1MediaDataFromHtml
} from '../scraper';

describe('respaldo HTML de episodios de AnimeAV1', () => {
  it('extrae la identidad oficial desde la respuesta SvelteKit', () => {
    const media = extractAnimeAV1MediaData({
      nodes: [{
        type: 'data',
        data: [
          { media: 1 },
          {
            title: 2,
            slug: 3,
            malId: 4,
            startDate: 5,
            endDate: 6,
            category: 7,
            episodes: 10,
            episodesCount: 15
          },
          'Example Season 2',
          'example-season-2',
          62076,
          '2026-07-03',
          null,
          { name: 8, slug: 9 },
          'TV Anime',
          'tv-anime',
          [11, 12],
          { id: 13, number: 14 },
          { id: 16, number: 17 },
          1001,
          1,
          2,
          1002,
          2
        ]
      }]
    }, 'fallback');

    expect(media).toMatchObject({
      title: 'Example Season 2',
      slug: 'example-season-2',
      malId: 62076,
      startDate: '2026-07-03',
      category: { name: 'TV Anime', slug: 'tv-anime' },
      declaredEpisodesCount: 2
    });
    expect(media.episodes).toEqual([
      { id: 1001, number: 1 },
      { id: 1002, number: 2 }
    ]);
  });

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
    expect(media.malId).toBeNull();
    expect(media.startDate).toBeNull();
    expect(media.category).toBeNull();
    expect(media.episodes).toEqual([
      { id: 1, number: 1 },
      { id: 12, number: 12 }
    ]);
    expect(media.declaredEpisodesCount).toBe(2);
    expect(media.extractionSource).toBe('html');
  });
});
