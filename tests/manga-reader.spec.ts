import { expect, test } from '@playwright/test';

const mockMangaApi = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      backend: { getConfig: async () => ({}) },
      isMaximized: async () => false,
      minimize: () => undefined,
      maximize: () => undefined,
      close: () => undefined,
      manga: {
        listOfflineChapters: async () => ({
          chapters: [{ key: 'Mock Manga - Capitulo 1', label: 'Mock Manga - Capitulo 1', pages: 3 }]
        }),
        readChapter: async (request: { offset?: number }) => {
          const offset = request.offset || 0;
          const offsets = (window as Window & { __mapleOfflineOffsets?: number[] }).__mapleOfflineOffsets || [];
          offsets.push(offset);
          (window as Window & { __mapleOfflineOffsets?: number[] }).__mapleOfflineOffsets = offsets;
          return {
            pages: [
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="480"%3E%3Crect width="100%" height="100%" fill="%235b21b6"/%3E%3C/svg%3E',
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="480"%3E%3Crect width="100%" height="100%" fill="%230f766e"/%3E%3C/svg%3E',
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="480"%3E%3Crect width="100%" height="100%" fill="%23b45309"/%3E%3C/svg%3E'
            ].slice(offset, offset + 1),
            total: 3,
            offset,
            hasMore: offset < 2
          };
        }
      }
    };
  });

  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname === '/settings/ai') {
      return route.fulfill({ json: { enabled: false } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga') {
      return route.fulfill({ json: { rows: [{ id: 1, title: 'Mock Manga', synopsis: 'Sinopsis de prueba', year: 2025, format: 'manga', chapters: 1 }], total: 1, limit: 30, offset: 0 } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/1') {
      return route.fulfill({ json: { id: 1, title: 'Mock Manga', synopsis: 'Sinopsis de prueba', year: 2025, format: 'manga', chapters: 1 } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/1/chapters') {
      return route.fulfill({ json: { chapters: [{ id: 'chapter-1', number: 1, language: 'es', sourceUrl: 'https://example.test/chapter-1' }] } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/sources') {
      return route.fulfill({ json: { providers: [], candidates: [], policy: 'fixture' } });
    }
    if (request.method() === 'GET' && url.pathname === '/dashboard/summary') {
      return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
    }
    if (request.method() === 'GET' && ['/anime', '/user-list', '/recommendations', '/downloads'].includes(url.pathname)) {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [] });
  });
};

test.describe('Lector de manga offline', () => {
  test('carga páginas bajo demanda y conserva controles de lectura', async ({ page }) => {
    await mockMangaApi(page);

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Manga' }).click();
    await expect(page.getByRole('heading', { name: 'Manga', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Mock Manga/ }).click();
    await expect(page.getByRole('heading', { name: 'Ficha de Mock Manga' })).toBeVisible();
    await page.getByRole('button', { name: /Cap\. 1/ }).click();

    const reader = page.getByTestId('manga-reader');
    await expect(reader).toBeVisible();
    await expect(page.getByTestId('manga-reader-current-page')).toHaveAttribute('alt', 'Página 1 de 3');

    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page.getByTestId('manga-reader-current-page')).toHaveAttribute('alt', 'Página 2 de 3');
    await expect.poll(() => page.evaluate(() => (window as Window & { __mapleOfflineOffsets?: number[] }).__mapleOfflineOffsets || [])).toEqual([0, 1]);

    await page.getByRole('button', { name: 'Acercar' }).click();
    await expect(page.getByText('110%')).toBeVisible();

    await page.getByRole('button', { name: 'Personalizar lector' }).click();
    await page.getByRole('button', { name: 'Der. a izq.' }).click();
    await expect(page.getByRole('button', { name: 'Página anterior' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
  });
});
