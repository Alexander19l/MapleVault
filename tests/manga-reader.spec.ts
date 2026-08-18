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
        listOfflineChapters: async (request: { series?: string }) => {
          if (request?.series === 'Online Manga') {
            return { chapters: [{ key: 'Online Manga - Capitulo 2', label: 'Online Manga - Capitulo 2', pages: 4 }] };
          }
          return {
            chapters: [{ key: 'Mock Manga - Capitulo 1', label: 'Mock Manga - Capitulo 1', pages: 3 }]
          };
        },
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
      return route.fulfill({ json: { id: 1, title: 'Mock Manga', synopsis: 'Sinopsis de prueba traducida', year: 2025, format: 'manga', chapters: 1, translation: { translated: true, status: 'translated' } } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/1/chapters') {
      return route.fulfill({ json: { chapters: [{ id: 'chapter-1', number: 1, language: 'es', sourceUrl: 'https://example.test/chapter-1' }] } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/sources') {
      return route.fulfill({ json: { providers: [{ id: 'mangadex', label: 'MangaDex', baseUrl: 'https://api.mangadex.org', languages: ['es', 'en'], status: 'active', enabled: true, notes: 'fixture' }], candidates: [], policy: 'fixture' } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/recent') {
      return route.fulfill({ json: { results: [], supported: true } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/tags') {
      return route.fulfill({
        json: {
          tags: [
            { id: 'tag-action', name: 'Acción', group: 'genre' },
            { id: 'tag-isekai', name: 'Isekai', group: 'theme' }
          ],
          supported: true
        }
      });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/search') {
      return route.fulfill({ json: { results: [{ id: '11111111-1111-1111-1111-111111111111', title: 'Online Manga', synopsis: 'English synopsis from search.', sourceUrl: 'https://mangadex.org/title/fixture' }], page: 0, hasMore: false } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/11111111-1111-1111-1111-111111111111/details') {
      return route.fulfill({ json: { manga: { id: '11111111-1111-1111-1111-111111111111', title: 'Online Manga', synopsis: 'Sinopsis traducida al español.', sourceUrl: 'https://mangadex.org/title/fixture', translation: { translated: true, status: 'translated' } } } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/11111111-1111-1111-1111-111111111111/chapters') {
      return route.fulfill({
        json: {
          chapters: [
            { id: '22222222-2222-2222-2222-222222222222', number: 1, language: 'es', title: 'El comienzo', group: 'Fansub Test', sourceUrl: 'https://mangadex.org/chapter/fixture-1' },
            { id: '44444444-4444-4444-4444-444444444444', number: 2, language: 'en', title: 'La revelación', sourceUrl: 'https://mangadex.org/chapter/fixture-2' }
          ]
        }
      });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/chapters/22222222-2222-2222-2222-222222222222/pages') {
      return route.fulfill({ json: { chapterId: '22222222-2222-2222-2222-222222222222', quality: 'data-saver', pages: ['http://localhost:5000/manga/online/page-proxy?provider=mangadex&fixture=1'] } });
    }
    if (request.method() === 'GET' && url.pathname === '/manga/online/page-proxy') {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
      });
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

test.describe('Lector de manga', () => {
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

    // El zoom debe aplicarse también en modo Continuo, no solo en Página.
    await page.getByRole('button', { name: 'Continuo' }).click();
    const continuousStrip = page.getByTestId('manga-reader-continuous');
    await expect(continuousStrip).toBeVisible();
    const firstContinuousImage = continuousStrip.locator('img').first();
    await expect(firstContinuousImage).toHaveCSS('width', /.+/);
    const widthAt110 = await firstContinuousImage.evaluate(el => el.getBoundingClientRect().width);

    await page.getByRole('button', { name: 'Alejar' }).click();
    await page.getByRole('button', { name: 'Alejar' }).click();
    await expect(page.getByText('90%')).toBeVisible();
    await expect.poll(() => firstContinuousImage.evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(widthAt110);

    await page.getByRole('button', { name: 'Página' }).click();
    await page.getByRole('button', { name: 'Personalizar lector' }).click();
    await page.getByRole('button', { name: 'Der. a izq.' }).click();
    await expect(page.getByRole('button', { name: 'Página anterior' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
  });

  test('mantiene la ficha en el viewport, traduce la sinopsis y carga el proxy local', async ({ page }) => {
    await mockMangaApi(page);

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Manga' }).click();
    await page.getByRole('tab', { name: /Buscar en MangaDex/ }).click();
    await page.getByPlaceholder('Buscar manga en MangaDex...').fill('online');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('button', { name: /Online Manga/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Ficha de Online Manga' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Sinopsis traducida al español.')).toBeVisible();
    await expect(dialog.getByText('Sinopsis traducida al español por LibreTranslate.')).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    await dialog.getByRole('button', { name: /Cap\. 1/ }).click();
    const image = page.getByTestId('manga-reader-current-page');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });

  test('muestra título, grupo, descarga y orden de capítulos; traduce la ficha local', async ({ page }) => {
    await mockMangaApi(page);

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Manga' }).click();

    // Ficha local: la sinopsis traducida debe verse con el mismo aviso que la ficha online.
    await page.getByRole('button', { name: /Mock Manga/ }).click();
    const localDialog = page.getByRole('dialog', { name: 'Ficha de Mock Manga' });
    await expect(localDialog).toBeVisible();
    await expect(localDialog.getByText('Sinopsis de prueba traducida')).toBeVisible();
    await expect(localDialog.getByText('Sinopsis traducida al español por LibreTranslate.')).toBeVisible();
    await localDialog.getByRole('button', { name: 'Cerrar' }).click();

    // Panel de género: chips en vez de <select multiple>.
    await page.getByRole('tab', { name: /Buscar en MangaDex/ }).click();
    await expect(page.locator('select[multiple]')).toHaveCount(0);
    const genreGroup = page.getByRole('group', { name: 'Géneros' });
    await expect(genreGroup).toBeVisible();
    const actionChip = genreGroup.getByRole('button', { name: 'Acción' });
    await expect(actionChip).toHaveAttribute('aria-pressed', 'false');
    await actionChip.click();
    await expect(actionChip).toHaveAttribute('aria-pressed', 'true');

    // El chip seleccionado aparece también en la franja de "Seleccionados".
    const selectedStrip = page.locator('text=Seleccionados').locator('..');
    await expect(selectedStrip.getByRole('button', { name: /Acción/ })).toBeVisible();

    // El buscador filtra los chips visibles sin afectar la selección activa.
    const genreSearch = page.getByPlaceholder('Buscar género o tema...');
    await genreSearch.fill('Isekai');
    await expect(genreGroup.getByRole('button', { name: 'Acción' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Temas y etiquetas' }).getByRole('button', { name: 'Isekai' })).toBeVisible();
    await expect(selectedStrip.getByRole('button', { name: /Acción/ })).toBeVisible();

    // Quitar desde la franja de seleccionados desmarca el chip original.
    await genreSearch.fill('');
    await selectedStrip.getByRole('button', { name: /Acción/ }).click();
    await expect(actionChip).toHaveAttribute('aria-pressed', 'false');

    // Ficha online con dos capítulos: título, grupo de traducción y estado de descarga.
    await page.getByPlaceholder('Buscar manga en MangaDex...').fill('online');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('button', { name: /Online Manga/ }).click();
    const onlineDialog = page.getByRole('dialog', { name: 'Ficha de Online Manga' });
    await expect(onlineDialog).toBeVisible();

    const rows = onlineDialog.getByTestId('manga-chapter-row');
    await expect(rows).toHaveCount(2);

    // Orden ascendente por defecto: capítulo 1 primero, sin marca de descarga (no está offline).
    await expect(rows.nth(0).getByTestId('manga-chapter-label')).toHaveText('Cap. 1 · El comienzo');
    await expect(rows.nth(0)).toContainText('Fansub Test');
    await expect(rows.nth(0).getByTestId('manga-chapter-offline-badge')).toHaveCount(0);

    // El capítulo 2 aparece marcado como ya descargado (mock de listOfflineChapters).
    await expect(rows.nth(1).getByTestId('manga-chapter-label')).toHaveText('Cap. 2 · La revelación');
    await expect(rows.nth(1).getByTestId('manga-chapter-offline-badge')).toBeVisible();

    // Invertir el orden debe mover el capítulo 2 al primer lugar.
    await onlineDialog.getByTitle('Orden ascendente').click();
    await expect(rows.nth(0).getByTestId('manga-chapter-label')).toHaveText('Cap. 2 · La revelación');
    await expect(rows.nth(1).getByTestId('manga-chapter-label')).toHaveText('Cap. 1 · El comienzo');
  });

  test('filtra la biblioteca por estado, cambia el estado desde la ficha y lee online un capítulo no descargado', async ({ page }) => {
    let mangaReadStatus: string | null = null;
    let mangaFavorite = 0;
    let updateCalls = 0;

    await page.addInitScript(() => {
      (window as any).electronAPI = {
        backend: { getConfig: async () => ({}) },
        isMaximized: async () => false,
        minimize: () => undefined,
        maximize: () => undefined,
        close: () => undefined,
        manga: {
          // Solo el capítulo 1 tiene copia offline; el 2 debe caer a online.
          listOfflineChapters: async () => ({
            chapters: [{ key: 'Biblioteca Manga - Capitulo 1', label: 'Biblioteca Manga - Capitulo 1', pages: 1 }]
          }),
          readChapter: async () => ({
            pages: ['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="10" height="10"%3E%3Crect width="100%25" height="100%25" fill="%235b21b6"/%3E%3C/svg%3E'],
            total: 1
          })
        }
      };
    });

    await page.route('http://localhost:5000/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();

      if (method === 'GET' && url.pathname === '/settings/ai') return route.fulfill({ json: { enabled: false } });
      if (method === 'GET' && url.pathname === '/manga') {
        const matchesFilter =
          (!url.searchParams.get('readStatus') || url.searchParams.get('readStatus') === mangaReadStatus) &&
          (url.searchParams.get('favorite') !== 'true' || mangaFavorite === 1);
        const rows = matchesFilter
          ? [{ id: 9, title: 'Biblioteca Manga', synopsis: 'x', year: 2025, format: 'manga', chapters: 2, read_status: mangaReadStatus, favorite: mangaFavorite }]
          : [];
        return route.fulfill({ json: { rows, total: rows.length, limit: 30, offset: 0 } });
      }
      if (method === 'GET' && url.pathname === '/manga/9') {
        return route.fulfill({ json: { id: 9, source: 'mangadex', title: 'Biblioteca Manga', synopsis: 'x', year: 2025, format: 'manga', chapters: 2, read_status: mangaReadStatus, favorite: mangaFavorite } });
      }
      if (method === 'GET' && url.pathname === '/manga/9/chapters') {
        return route.fulfill({
          json: {
            chapters: [
              { id: 'chapter-offline', number: 1, language: 'es', sourceUrl: 'https://example.test/1' },
              { id: 'chapter-online-only', number: 2, language: 'es', sourceUrl: 'https://example.test/2' }
            ]
          }
        });
      }
      if (method === 'PUT' && url.pathname === '/manga/9/user-list') {
        updateCalls += 1;
        const body = request.postDataJSON();
        if (body?.read_status !== undefined) mangaReadStatus = body.read_status;
        if (body?.favorite !== undefined) mangaFavorite = body.favorite ? 1 : 0;
        return route.fulfill({ json: { message: 'Biblioteca local actualizada.' } });
      }
      if (method === 'GET' && url.pathname === '/manga/online/chapters/chapter-online-only/pages') {
        return route.fulfill({ json: { chapterId: 'chapter-online-only', quality: 'data-saver', pages: ['http://localhost:5000/manga/online/page-proxy?provider=mangadex&fixture=2'] } });
      }
      if (method === 'GET' && url.pathname === '/manga/online/page-proxy') {
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
        });
      }
      if (method === 'GET' && url.pathname === '/manga/sources') return route.fulfill({ json: { providers: [], candidates: [], policy: 'fixture' } });
      if (method === 'GET' && url.pathname === '/dashboard/summary') return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
      if (method === 'GET' && ['/anime', '/user-list', '/recommendations', '/downloads'].includes(url.pathname)) return route.fulfill({ json: [] });
      return route.fulfill({ json: [] });
    });

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Manga' }).click();

    // Sin filtro (Todos): la serie aparece.
    await expect(page.getByRole('button', { name: /Biblioteca Manga/ })).toBeVisible();

    // Filtrar por "Favorito" la oculta (todavía no lo es).
    await page.getByRole('tab', { name: 'Favorito' }).click();
    await expect(page.getByRole('button', { name: /Biblioteca Manga/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Todos' }).click();
    await expect(page.getByRole('button', { name: /Biblioteca Manga/ })).toBeVisible();

    await page.getByRole('button', { name: /Biblioteca Manga/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Ficha de Biblioteca Manga' });
    await expect(dialog).toBeVisible();

    // Cambiar estado y marcar favorito desde la ficha persiste en el backend.
    await dialog.getByRole('button', { name: 'Viendo' }).click();
    await expect.poll(() => updateCalls).toBe(1);
    await dialog.getByRole('button', { name: /Favorito/ }).click();
    await expect.poll(() => updateCalls).toBe(2);
    await expect(dialog.getByRole('button', { name: '★ Favorito' })).toBeVisible();

    // El capítulo 1 (offline) se lee localmente; el 2 (sin descargar) cae a online.
    const rows = dialog.getByTestId('manga-chapter-row');
    await expect(rows.nth(0).getByTestId('manga-chapter-offline-badge')).toBeVisible();
    await expect(rows.nth(1)).toContainText('Solo en línea');

    await rows.nth(1).getByTestId('manga-chapter-label').click();
    const image = page.getByTestId('manga-reader-current-page');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });
});
