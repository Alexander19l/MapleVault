import { describe, expect, it, vi } from 'vitest';
import { ZonaTmoProvider } from '../../src/manga/zonaTmoProvider';

const sourcePath = Buffer.from('/library/manga/4215/blue-lock', 'utf8').toString('base64url');

describe('ZonaTmoProvider', () => {
  it('extrae resultados del catálogo público y conserva la ruta segura', async () => {
    const get = vi.fn().mockResolvedValue({
      data: `
        <div id="library-grid">
          <div class="element">
            <a href="https://zonatmo.org/library/manga/4215/blue-lock">
              <div class="thumbnail-title"><h4>Blue Lock</h4></div>
              <img src="https://zonatmo.org/storage/covers/4215.webp?v=2">
            </a>
          </div>
        </div>`
    });
    const provider = new ZonaTmoProvider({ get } as any);

    const results = await provider.search('blue lock');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'Blue Lock',
      sourceUrl: 'https://zonatmo.org/library/manga/4215/blue-lock',
      coverUrl: 'https://zonatmo.org/storage/covers/4215.webp?v=2'
    });
    expect(get).toHaveBeenCalledWith(
      'https://zonatmo.org/biblioteca',
      expect.objectContaining({ params: { title: 'blue lock', _pg: 1 } })
    );
  });

  it('carga la sinopsis completa y reutiliza la ficha al listar capítulos', async () => {
    const get = vi.fn().mockResolvedValue({
      data: `
        <meta property="og:image" content="https://zonatmo.org/storage/covers/4215.webp?v=2">
        <h1 class="book-type">MANGA</h1>
        <h1 class="element-title">Blue Lock</h1>
        <p id="manga-synopsis">Sinopsis completa en español.</p>
        <li class="upload-link"><span>Capítulo 1</span><a href="/view_uploads/10">Leer</a></li>`
    });
    const provider = new ZonaTmoProvider({ get } as any);

    const details = await provider.getDetails(sourcePath);
    const chapters = await provider.getChapters(sourcePath);

    expect(details).toMatchObject({
      title: 'Blue Lock',
      synopsis: 'Sinopsis completa en español.',
      coverUrl: 'https://zonatmo.org/storage/covers/4215.webp?v=2'
    });
    expect(chapters[0]).toMatchObject({ number: 1, language: 'es' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ordena capítulos y páginas aunque la fuente los entregue desordenados', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        data: `
          <ul>
            <li class="upload-link"><span>Capítulo 10</span><a href="/view_uploads/10">Leer online</a></li>
            <li class="upload-link"><span>Capítulo 2.1</span><a href="/view_uploads/21">Leer online</a></li>
            <li class="upload-link"><span>Capítulo 2</span><a href="/view_uploads/2">Leer online</a></li>
          </ul>`
      })
      .mockResolvedValueOnce({
        data: `
          <img alt="Página 3" src="https://storage2.zonatmo.org/chapters/2/3.webp">
          <img alt="Página 1" src="https://storage2.zonatmo.org/chapters/2/1.webp">
          <img alt="Página 2" src="https://storage2.zonatmo.org/chapters/2/2.webp">`
      });
    const provider = new ZonaTmoProvider({ get } as any);

    const chapters = await provider.getChapters(sourcePath);
    const pages = await provider.getPages('2');

    expect(chapters.map(chapter => chapter.number)).toEqual([2, 2.1, 10]);
    expect(pages.pages.map(page => page.split('/').pop())).toEqual(['1.webp', '2.webp', '3.webp']);
  });

  it('rechaza páginas que no pertenecen a la CDN permitida', async () => {
    const get = vi.fn().mockResolvedValue({
      data: '<img alt="Página 1" src="https://example.com/page.webp">'
    });
    const provider = new ZonaTmoProvider({ get } as any);

    await expect(provider.getPages('2')).rejects.toThrow('no devolvió páginas válidas');
  });
});
