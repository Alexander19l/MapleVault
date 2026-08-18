import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMangaRouter } from '../../src/routes/mangaRoutes';

const queryGetMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();
const queryAllMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any[]>>();
const mangaRunMock = vi.fn<(sql: string, params?: unknown[]) => Promise<any>>();
const mangaDexSearchMock = vi.fn();
const mangaDexDetailsMock = vi.fn();
const mangaDexChaptersMock = vi.fn();
const mangaDexPagesMock = vi.fn();
const mangaDexDownloadMock = vi.fn();
const zonaTmoSearchMock = vi.fn();
const zonaTmoDetailsMock = vi.fn();
const zonaTmoChaptersMock = vi.fn();
const zonaTmoPagesMock = vi.fn();
const zonaTmoDownloadMock = vi.fn();
const shadeMangaSearchMock = vi.fn();
const shadeMangaDetailsMock = vi.fn();
const shadeMangaChaptersMock = vi.fn();
const shadeMangaPagesMock = vi.fn();
const shadeMangaDownloadMock = vi.fn();
const translationMock = vi.fn();

let server: Server;
let baseUrl: string;

async function requestJson(requestPath: string) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  return {
    response,
    json: await response.json()
  };
}

async function requestJsonPost(requestPath: string, body: unknown) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response, json: await response.json() };
}

describe('Manga HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createMangaRouter({
      queryClient: {
        get: queryGetMock,
        all: queryAllMock,
        run: mangaRunMock
      },
      sourceCandidatesProvider: () => [
        {
          id: 'mangadex',
          name: 'MangaDex API',
          url: 'https://api.mangadex.org',
          content: 'manga',
          languages: ['multi'],
          use: ['metadata', 'manga-provider'],
          risk: 'medium',
          enabledByDefault: false,
          notes: 'Candidato auditado antes de activarse.'
        }
      ] as any,
      mangaDexProvider: {
        search: mangaDexSearchMock,
        getDetails: mangaDexDetailsMock,
        getChapters: mangaDexChaptersMock,
        getPages: mangaDexPagesMock,
        downloadPages: mangaDexDownloadMock
      } as any,
      zonaTmoProvider: {
        search: zonaTmoSearchMock,
        getDetails: zonaTmoDetailsMock,
        getChapters: zonaTmoChaptersMock,
        getPages: zonaTmoPagesMock,
        downloadPages: zonaTmoDownloadMock
      } as any,
      shadeMangaProvider: {
        search: shadeMangaSearchMock,
        getDetails: shadeMangaDetailsMock,
        getChapters: shadeMangaChaptersMock,
        getPages: shadeMangaPagesMock,
        downloadPages: shadeMangaDownloadMock
      } as any,
      translationProvider: translationMock
    }));

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    queryAllMock.mockResolvedValue([]);
    queryGetMock.mockResolvedValue({ total: 0 });
    mangaRunMock.mockResolvedValue({ lastID: 7, changes: 1 });
    mangaDexSearchMock.mockResolvedValue([]);
    mangaDexDetailsMock.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111', title: 'Manga' });
    mangaDexChaptersMock.mockResolvedValue([]);
    mangaDexPagesMock.mockResolvedValue({ chapterId: '22222222-2222-2222-2222-222222222222', quality: 'data-saver', pages: [] });
    mangaDexDownloadMock.mockResolvedValue(Buffer.from('zip'));
    zonaTmoSearchMock.mockResolvedValue([]);
    zonaTmoDetailsMock.mockResolvedValue({ id: 'zona-id', title: 'Zona manga' });
    zonaTmoChaptersMock.mockResolvedValue([]);
    zonaTmoPagesMock.mockResolvedValue({ chapterId: '2', quality: 'data-saver', pages: [] });
    zonaTmoDownloadMock.mockResolvedValue(Buffer.from('zip'));
    shadeMangaSearchMock.mockResolvedValue([]);
    shadeMangaDetailsMock.mockResolvedValue({ id: '3DySaf', title: 'Solo Leveling' });
    shadeMangaChaptersMock.mockResolvedValue([]);
    shadeMangaPagesMock.mockResolvedValue({ chapterId: 'Chap02', quality: 'data-saver', pages: [] });
    shadeMangaDownloadMock.mockResolvedValue(Buffer.from('zip'));
    translationMock.mockImplementation(async ({ text }: { text: string }) => ({
      text,
      translated: false,
      cached: false,
      status: 'spanish_source',
      provider: 'libretranslate'
    }));
  });

  it('expone MangaDex como servidor principal y tres proveedores operativos', async () => {
    const { response, json } = await requestJson('/manga/online/providers');

    expect(response.status).toBe(200);
    expect(json.defaultProvider).toBe('mangadex');
    expect(json.providers.map((provider: any) => provider.id)).toEqual([
      'mangadex', 'zonatmo', 'shademanga'
    ]);
    expect(json.providers.every((provider: any) => provider.enabled)).toBe(true);
  });

  it('devuelve una lista vacia paginada sin activar scraping', async () => {
    const { response, json } = await requestJson('/manga?withTotal=true&limit=24&offset=0');

    expect(response.status).toBe(200);
    expect(json).toEqual({
      rows: [],
      total: 0,
      limit: 24,
      offset: 0
    });
    expect(queryAllMock.mock.calls[0][0]).toContain('FROM manga m');
  });

  it('expone fuentes candidatas de manga como desactivadas por defecto', async () => {
    queryAllMock.mockResolvedValueOnce([
      {
        id: 1,
        name: 'AniList Manga',
        base_url: 'https://graphql.anilist.co',
        language: 'multi',
        type: 'metadata',
        enabled: 0,
        risk_level: 'low',
        rate_limit: 1000,
        last_sync: null
      }
    ]);

    const { response, json } = await requestJson('/manga/sources');

    expect(response.status).toBe(200);
    expect(json.configured[0]).toMatchObject({
      name: 'AniList Manga',
      enabled: 0
    });
    expect(json.candidates[0]).toMatchObject({
      id: 'mangadex',
      enabledByDefault: false
    });
  });

  it('devuelve 404 cuando el manga no existe', async () => {
    queryGetMock.mockResolvedValueOnce(null);

    const { response, json } = await requestJson('/manga/44');

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: 'Manga no encontrado.' });
  });

  it('traduce la sinopsis al abrir una ficha de la biblioteca local', async () => {
    queryGetMock.mockResolvedValueOnce({
      id: 8,
      title: 'Saved Manga',
      synopsis: 'This saved synopsis is long enough to require a translation into Spanish.',
      genre_names: null
    });
    translationMock.mockResolvedValueOnce({
      text: 'Esta sinopsis guardada está traducida al español.',
      translated: true,
      cached: false,
      status: 'translated',
      provider: 'libretranslate'
    });

    const { response, json } = await requestJson('/manga/8');

    expect(response.status).toBe(200);
    expect(json.synopsis).toBe('Esta sinopsis guardada está traducida al español.');
    expect(json.synopsis_original).toContain('saved synopsis');
    expect(translationMock).toHaveBeenCalledWith(expect.objectContaining({
      entityKey: 'manga:local:8',
      field: 'synopsis'
    }));
  });

  it('expone búsqueda remota y limita el contrato a MangaDex', async () => {
    mangaDexSearchMock.mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', title: 'Manga ES' }]);

    const { response, json } = await requestJson('/manga/online/search?q=manga');

    expect(response.status).toBe(200);
    expect(json.provider.id).toBe('mangadex');
    expect(json.results[0].title).toBe('Manga ES');
    expect(mangaDexSearchMock).toHaveBeenCalledWith('manga', 20);
  });

  it('rechaza identificadores remotos inválidos antes de consultar la API', async () => {
    const { response, json } = await requestJson('/manga/online/not-a-uuid/chapters');

    expect(response.status).toBe(400);
    expect(json.error).toContain('Identificador de manga inválido');
    expect(mangaDexChaptersMock).not.toHaveBeenCalled();
  });

  it('consulta ZonaTMO cuando se selecciona su servidor', async () => {
    zonaTmoSearchMock.mockResolvedValueOnce([{ id: 'zona-id', title: 'Blue Lock' }]);

    const { response, json } = await requestJson('/manga/online/search?q=blue%20lock&source=zonatmo');

    expect(response.status).toBe(200);
    expect(json.provider.id).toBe('zonatmo');
    expect(json.results[0].title).toBe('Blue Lock');
    expect(zonaTmoSearchMock).toHaveBeenCalledWith('blue lock', 20);
  });

  it('permite buscar por género sin introducir un título', async () => {
    mangaDexSearchMock.mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', title: 'Romance' }]);

    const { response, json } = await requestJson('/manga/online/search?source=mangadex&genres=genre-id');

    expect(response.status).toBe(200);
    expect(json.results[0].title).toBe('Romance');
    expect(mangaDexSearchMock).toHaveBeenCalledWith('', 20, expect.objectContaining({ genres: ['genre-id'] }));
  });

  it('guarda una obra online y sus capítulos en la biblioteca local', async () => {
    queryGetMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 4 });

    const { response, json } = await requestJsonPost('/manga/library', {
      source: 'mangadex',
      externalId: '11111111-1111-1111-1111-111111111111',
      title: 'Obra local',
      synopsis: 'Sinopsis de prueba',
      genres: ['Romance'],
      chapters: [{ id: '22222222-2222-2222-2222-222222222222', number: 1, language: 'es', sourceUrl: 'https://mangadex.org/chapter/x' }]
    });

    expect(response.status).toBe(201);
    expect(json).toEqual({ saved: true, mangaId: 7 });
    expect(mangaRunMock).toHaveBeenCalled();
  });

  it('retira proveedores descartados del contrato público', async () => {
    const { response, json } = await requestJson('/manga/online/search?q=blue%20lock&source=manhwaweb');

    expect(response.status).toBe(400);
    expect(json.code).toBe('MANGA_PROVIDER_INVALID');
  });

  it('consulta ShadeManga y devuelve la ficha seleccionada', async () => {
    shadeMangaSearchMock.mockResolvedValueOnce([{ id: '3DySaf', title: 'Solo Leveling' }]);
    shadeMangaDetailsMock.mockResolvedValueOnce({
      id: '3DySaf',
      title: 'Solo Leveling',
      synopsis: 'Sinopsis en español.'
    });

    const search = await requestJson('/manga/online/search?q=solo%20leveling&source=shademanga');
    const details = await requestJson('/manga/online/3DySaf/details?source=shademanga');

    expect(search.response.status).toBe(200);
    expect(search.json.results[0].title).toBe('Solo Leveling');
    expect(details.response.status).toBe(200);
    expect(details.json.manga.synopsis).toBe('Sinopsis en español.');
    expect(shadeMangaDetailsMock).toHaveBeenCalledWith('3DySaf');
  });

  it('traduce al español la sinopsis de la ficha remota', async () => {
    mangaDexDetailsMock.mockResolvedValueOnce({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Remote Manga',
      synopsis: 'This synopsis is written in English and contains enough text to require translation.'
    });
    translationMock.mockResolvedValueOnce({
      text: 'Esta sinopsis fue traducida al español.',
      translated: true,
      cached: false,
      status: 'translated',
      provider: 'libretranslate'
    });

    const { response, json } = await requestJson('/manga/online/11111111-1111-1111-1111-111111111111/details');

    expect(response.status).toBe(200);
    expect(json.manga.synopsis).toBe('Esta sinopsis fue traducida al español.');
    expect(json.manga.synopsis_original).toContain('written in English');
    expect(json.manga.translation).toMatchObject({ translated: true, status: 'translated' });
    expect(translationMock).toHaveBeenCalledWith(expect.objectContaining({
      entityKey: 'manga:mangadex:11111111-1111-1111-1111-111111111111',
      field: 'synopsis'
    }));
  });

  it('devuelve páginas de manga con URL absoluta del backend para el lector', async () => {
    mangaDexPagesMock.mockResolvedValueOnce({
      chapterId: '22222222-2222-2222-2222-222222222222',
      quality: 'data-saver',
      pages: ['https://uploads.mangadex.org/data-saver/hash/1.jpg']
    });

    const { response, json } = await requestJson('/manga/online/chapters/22222222-2222-2222-2222-222222222222/pages');

    expect(response.status).toBe(200);
    expect(json.pages[0]).toMatch(new RegExp(`^${baseUrl}/manga/online/page-proxy\\?`));
    expect(json.pages[0]).toContain('provider=mangadex');
  });
});
