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

  it('descarta capítulos fuera de español e inglés', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        result: 'ok',
        data: [
          { id: chapterId, type: 'chapter', attributes: { translatedLanguage: 'es', chapter: '1' } },
          { id: '33333333-3333-3333-3333-333333333333', type: 'chapter', attributes: { translatedLanguage: 'fr', chapter: '2' } }
        ]
      }
    });
    const provider = new MangaDexProvider({ get } as any);

    const result = await provider.getChapters(mangaId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: chapterId, language: 'es', number: 1 });
    expect(get).toHaveBeenCalledWith('/chapter', expect.objectContaining({
      params: expect.objectContaining({ manga: mangaId })
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
});
