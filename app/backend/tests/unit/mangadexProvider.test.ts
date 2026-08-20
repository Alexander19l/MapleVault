import { describe, expect, it, vi } from 'vitest';
import {
  buildChapterZip,
  MangaDexProvider,
  sanitizeDownloadName
} from '../../src/manga/mangadexProvider';

const mangaId = '11111111-1111-1111-1111-111111111111';
const chapterId = '22222222-2222-2222-2222-222222222222';

describe('MangaDexProvider', () => {
  it('normaliza búsqueda y selecciona títulos y sinopsis en español', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        result: 'ok',
        data: [{
          id: mangaId,
          type: 'manga',
          attributes: {
            title: { en: 'Blue Lock', es: 'Blue Lock ES' },
            altTitles: [{ en: 'Blue Lock' }],
            description: { en: 'English description', es: 'Sinopsis en español' },
            year: 2018,
            status: 'ongoing',
            contentRating: 'safe'
          },
          relationships: [{
            type: 'cover_art',
            attributes: { fileName: 'cover.jpg' }
          }]
        }]
      }
    });
    const provider = new MangaDexProvider({ get } as any);

    const result = await provider.search('blue lock');

    expect(result[0]).toMatchObject({
      id: mangaId,
      title: 'Blue Lock ES',
      synopsis: 'Sinopsis en español',
      coverUrl: `https://uploads.mangadex.org/covers/${mangaId}/cover.jpg.256.jpg`
    });
    expect(get).toHaveBeenCalledWith('/manga', expect.objectContaining({
      params: expect.objectContaining({ title: 'blue lock' })
    }));
  });

  it('envía filtros oficiales de estado y etiquetas a MangaDex', async () => {
    const get = vi.fn().mockResolvedValue({ data: { result: 'ok', data: [] } });
    const provider = new MangaDexProvider({ get } as any);

    await provider.search('blue', 20, {
      genres: ['genre-id'],
      tags: ['theme-id'],
      status: 'ongoing'
    });

    expect(get).toHaveBeenCalledWith('/manga', expect.objectContaining({
      params: expect.objectContaining({
        'includedTags[]': ['genre-id', 'theme-id'],
        includedTagsMode: 'AND',
        'status[]': ['ongoing']
      })
    }));
  });

  it('pagina capítulos hasta recuperar todos los resultados disponibles', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `chapter-${index}`,
      type: 'chapter',
      attributes: { translatedLanguage: 'es', chapter: String(index + 1) }
    }));
    const secondPage = Array.from({ length: 25 }, (_, index) => ({
      id: `chapter-${index + 100}`,
      type: 'chapter',
      attributes: { translatedLanguage: 'es', chapter: String(index + 101) }
    }));
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { result: 'ok', data: firstPage, total: 125 } })
      .mockResolvedValueOnce({ data: { result: 'ok', data: secondPage, total: 125 } });
    const provider = new MangaDexProvider({ get } as any);

    const result = await provider.getChapters(mangaId);

    expect(result).toHaveLength(125);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][0]).toBe(`/manga/${mangaId}/feed`);
    expect(get.mock.calls[1][1].params.offset).toBe(100);
  });

  it('incluye español latino como español y descarta otros idiomas', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        result: 'ok',
        total: 3,
        data: [
          { id: chapterId, type: 'chapter', attributes: { translatedLanguage: 'es', chapter: '1' } },
          { id: '33333333-3333-3333-3333-333333333333', type: 'chapter', attributes: { translatedLanguage: 'es-la', chapter: '2' } },
          { id: '44444444-4444-4444-4444-444444444444', type: 'chapter', attributes: { translatedLanguage: 'fr', chapter: '3' } }
        ]
      }
    });
    const provider = new MangaDexProvider({ get } as any);

    const result = await provider.getChapters(mangaId);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: chapterId, language: 'es', number: 1 });
    expect(result[1]).toMatchObject({ language: 'es', number: 2 });
    expect(get).toHaveBeenCalledWith(`/manga/${mangaId}/feed`, expect.objectContaining({
      params: expect.objectContaining({ 'translatedLanguage[]': ['es', 'es-la', 'en'] })
    }));
  });

  it('solo devuelve páginas HTTPS de hosts MangaDex permitidos', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        baseUrl: 'https://uploads.mangadex.org',
        chapter: {
          hash: 'hash',
          dataSaver: ['1.jpg', '2.jpg']
        }
      }
    });
    const provider = new MangaDexProvider({ get } as any);

    const result = await provider.getPages(chapterId);

    expect(result.pages).toEqual([
      'https://uploads.mangadex.org/data-saver/hash/1.jpg',
      'https://uploads.mangadex.org/data-saver/hash/2.jpg'
    ]);
  });

  it('genera un ZIP válido y sanea nombres de descarga', () => {
    const archive = buildChapterZip([{ name: '001.jpg', data: Buffer.from('page') }]);

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    expect(sanitizeDownloadName('Serie: ../capitulo?', 'Manga')).toBe('Serie .. capitulo');
  });

  it('excluye la etiqueta Loli del panel de géneros/temas', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        result: 'ok',
        data: [
          { id: 'tag-action', attributes: { name: { en: 'Action' }, group: 'genre' } },
          { id: 'tag-loli', attributes: { name: { en: 'Loli' }, group: 'theme' } },
          { id: 'tag-isekai', attributes: { name: { en: 'Isekai' }, group: 'theme' } }
        ]
      }
    });
    const provider = new MangaDexProvider({ get } as any);

    const tags = await provider.getTags();

    expect(tags.map(tag => tag.name)).toEqual(['Action', 'Isekai']);
    expect(tags.some(tag => tag.name.toLowerCase() === 'loli')).toBe(false);
  });
});
