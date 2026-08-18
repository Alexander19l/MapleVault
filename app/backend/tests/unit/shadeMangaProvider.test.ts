import { describe, expect, it, vi } from 'vitest';
import { ShadeMangaProvider } from '../../src/manga/shadeMangaProvider';

describe('ShadeMangaProvider', () => {
  it('busca en el catálogo público y excluye contenido adulto', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          publicId: '3DySaf',
          titulo: 'Solo Leveling',
          estado: 'finalizado',
          esMayorDeEdad: false,
          portadaUrl: 'https://cdn.shademanga.com/mangas/s/solo-leveling/portada.webp'
        },
        { publicId: 'Adult1', titulo: 'Adulto', esMayorDeEdad: true }
      ]
    });
    const provider = new ShadeMangaProvider({ get } as any);

    const result = await provider.search('solo leveling');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '3DySaf',
      title: 'Solo Leveling',
      sourceUrl: 'https://shademanga.com/serie/3DySaf'
    });
    expect(get).toHaveBeenCalledWith('/series-locales/search-candidates', {
      params: { q: 'solo leveling', take: 20, excludeAdult: true }
    });
  });

  it('carga obras recientes desde el endpoint de novedades y conserva la portada', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          publicId: 'Abc123',
          titulo: 'Blue Lock',
          estado: 'En curso',
          esMayorDeEdad: false,
          portadaUrl: 'https://cdn.shademanga.com/mangas/blue.webp'
        },
        { publicId: 'Adult1', titulo: 'Adulto', esMayorDeEdad: true },
        {
          publicId: 'Def456',
          titulo: 'Jujutsu Kaisen',
          estado: 'En curso',
          esMayorDeEdad: false
        }
      ]
    });
    const provider = new ShadeMangaProvider({ get } as any);

    const result = await provider.getRecent(2);

    expect(get).toHaveBeenCalledWith('/series-locales/novedades-recientes');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'Abc123',
      title: 'Blue Lock',
      coverUrl: 'https://cdn.shademanga.com/mangas/blue.webp'
    });
    expect(result[1]).toMatchObject({ id: 'Def456', title: 'Jujutsu Kaisen' });
    expect(result[1].coverUrl).toBeUndefined();
  });

  it('carga una ficha con sinopsis en español', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        publicId: '3DySaf',
        titulo: 'Solo Leveling',
        descripcion: 'Sinopsis completa en español.',
        estado: 'finalizado',
        esMayorDeEdad: false,
        portadaUrl: 'https://cdn.shademanga.com/mangas/s/solo-leveling/portada.webp'
      }
    });
    const provider = new ShadeMangaProvider({ get } as any);

    const result = await provider.getDetails('3DySaf');

    expect(result).toMatchObject({
      id: '3DySaf',
      title: 'Solo Leveling',
      synopsis: 'Sinopsis completa en español.'
    });
  });

  it('ordena capítulos y páginas por su número real', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        data: [
          { publicId: 'Chap10', numeroCapitulo: 10, titulo: 'Cap 10', visible: true },
          { publicId: 'Chap02', numeroCapitulo: 2, titulo: 'Cap 2', visible: true }
        ]
      })
      .mockResolvedValueOnce({
        data: {
          publicCapituloId: 'Chap02',
          paginas: [
            'https://cdn.shademanga.com/mangas/serie/002/003.webp',
            'https://cdn.shademanga.com/mangas/serie/002/001.webp',
            'https://cdn.shademanga.com/mangas/serie/002/002.webp'
          ]
        }
      });
    const provider = new ShadeMangaProvider({ get } as any);

    const chapters = await provider.getChapters('3DySaf');
    const pages = await provider.getPages('Chap02');

    expect(chapters.map(chapter => chapter.number)).toEqual([2, 10]);
    expect(pages.pages.map(page => page.split('/').pop())).toEqual(['001.webp', '002.webp', '003.webp']);
  });

  it('rechaza páginas fuera de la CDN de ShadeManga', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { publicCapituloId: 'Chap02', paginas: ['https://example.com/001.webp'] }
    });
    const provider = new ShadeMangaProvider({ get } as any);

    await expect(provider.getPages('Chap02')).rejects.toThrow('cantidad de páginas no válida');
  });
});
