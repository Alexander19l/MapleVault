import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getMangaDownloadRoot,
  listOfflineMangaChapters,
  readOfflineMangaChapter,
  saveMangaArchive
} from '../../../desktop/electron/mangaOfflineStorage';

const NESTED_CHAPTER_ZIP = 'UEsDBBQAAAAIAFO9D107bquHCAAAAAYAAAAOAAAAaW1hZ2VzLzAwMS5wbmcrSExP1TUEAFBLAwQUAAAACABTvQ9dgT+iHggAAAAGAAAADgAAAGltYWdlcy8wMDIuanBnK0hMT9U1AgBQSwECFAAUAAAACABTvQ9dO26rhwgAAAAGAAAADgAAAAAAAAAAAAAAAAAAAAAAaW1hZ2VzLzAwMS5wbmdQSwECFAAUAAAACABTvQ9dgT+iHggAAAAGAAAADgAAAAAAAAAAAAAAAAA0AAAAaW1hZ2VzLzAwMi5qcGdQSwUGAAAAAAIAAgB4AAAAaAAAAAAA';
const temporaryRoots: string[] = [];

const createRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'maplevault-manga-'));
  temporaryRoots.push(root);
  return root;
};

describe('mangaOfflineStorage', () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
  });

  it('extrae imágenes anidadas y las lee en orden numérico por páginas', async () => {
    const downloadsPath = await createRoot();
    const result = await saveMangaArchive({
      series: 'Serie de prueba',
      fileName: 'Capitulo 1.zip',
      data: Buffer.from(NESTED_CHAPTER_ZIP, 'base64')
    }, downloadsPath);

    expect(result).toMatchObject({ saved: true, extractedPages: 2 });

    const downloadRoot = getMangaDownloadRoot(downloadsPath);
    const listed = await listOfflineMangaChapters(downloadRoot, { series: 'Serie de prueba' });
    expect(listed.chapters).toEqual([{ key: 'Capitulo 1', label: 'Capitulo 1', pages: 2 }]);

    const firstPage = await readOfflineMangaChapter(downloadRoot, {
      series: 'Serie de prueba', chapter: 'Capitulo 1', offset: 0, limit: 1
    });
    expect(firstPage).toMatchObject({ total: 2, offset: 0, hasMore: true });
    expect(Buffer.from(firstPage.pages[0].split(',')[1], 'base64').toString()).toBe('page-1');

    const secondPage = await readOfflineMangaChapter(downloadRoot, {
      series: 'Serie de prueba', chapter: 'Capitulo 1', offset: 1, limit: 1
    });
    expect(secondPage).toMatchObject({ total: 2, offset: 1, hasMore: false });
    expect(Buffer.from(secondPage.pages[0].split(',')[1], 'base64').toString()).toBe('page-2');
  });

  it('rechaza un archivo que no es ZIP sin crear la carpeta de descarga', async () => {
    const downloadsPath = await createRoot();
    const result = await saveMangaArchive({
      series: 'No valido',
      fileName: 'Capitulo 1.zip',
      data: Buffer.from('not-a-zip')
    }, downloadsPath);

    expect(result).toEqual({ saved: false, error: 'El archivo de manga no es un ZIP válido.' });
    await expect(fs.access(getMangaDownloadRoot(downloadsPath))).rejects.toThrow();
  });
});
