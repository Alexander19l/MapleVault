import { expect, test } from '@playwright/test';

const mockAnimePlayerApi = async (
  page: import('@playwright/test').Page,
  calls: {
    attach: Array<Record<string, unknown>>;
    reposition: Array<{ x: number; y: number; width: number; height: number }>;
    detach: number[];
  }
) => {
  await page.exposeFunction('__mapleRecordAttach', (request: Record<string, unknown>) => {
    calls.attach.push(request);
  });
  await page.exposeFunction('__mapleRecordReposition', (bounds: { x: number; y: number; width: number; height: number }) => {
    calls.reposition.push(bounds);
  });
  await page.exposeFunction('__mapleRecordDetach', () => {
    calls.detach.push(Date.now());
  });

  await page.addInitScript(() => {
    (window as any).electronAPI = {
      backend: { getConfig: async () => ({}) },
      isMaximized: async () => false,
      minimize: () => undefined,
      maximize: () => undefined,
      close: () => undefined,
      openExternal: () => undefined,
      player: {
        attach: async (request: Record<string, unknown>) => {
          await (window as any).__mapleRecordAttach(request);
          return { attached: true };
        },
        reposition: async (bounds: { x: number; y: number; width: number; height: number }) => {
          await (window as any).__mapleRecordReposition(bounds);
          return { ok: true };
        },
        detach: async () => {
          await (window as any).__mapleRecordDetach();
          return { ok: true };
        }
      }
    };
  });
};

const mockAnimeBackend = async (page: import('@playwright/test').Page) => {
  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/settings/ai') return route.fulfill({ json: { enabled: false } });
    if (method === 'GET' && url.pathname === '/dashboard/summary') {
      return route.fulfill({
        json: {
          stats: { total: 1, watching: 0, pending: 0, completed: 0, favorites: 0 },
          recentAdded: [{ id: 77, title: 'Test Anime', cover_image: '', studio: 'Studio X', year: 2024, type: 'tv', episodes: 1 }],
          airingList: []
        }
      });
    }
    if (method === 'GET' && url.pathname === '/recommendations') return route.fulfill({ json: [] });
    if (method === 'GET' && url.pathname === '/anime/77') {
      return route.fulfill({ json: { id: 77, title: 'Test Anime', synopsis: 'x', year: 2024, format: 'tv', episodes: 1 } });
    }
    if (method === 'GET' && url.pathname === '/anime/77/relations') return route.fulfill({ json: [] });
    if (method === 'GET' && url.pathname === '/anime/77/watched-episodes') return route.fulfill({ json: [] });
    if (method === 'GET' && url.pathname === '/anime/77/episodes') {
      return route.fulfill({ json: { episodes: [{ id: 1, number: 1 }] } });
    }
    if (method === 'GET' && url.pathname === '/anime/77/episodes/1') {
      return route.fulfill({
        json: {
          SUB: [{
            server: 'Test',
            url: 'https://example.test/embed/1',
            providerId: 'animeav1',
            language: 'es',
            referer: 'https://animeav1.com/media/test/1',
            playbackMode: 'inline'
          }]
        }
      });
    }
    if (method === 'GET' && ['/anime', '/user-list', '/recommendations', '/downloads', '/manga'].includes(url.pathname)) {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [] });
  });
};

test.describe('Reproductor de anime embebido', () => {
  test('reproduce el capítulo dentro de la app, sin ventana aparte, y sincroniza posición/cierre', async ({ page }) => {
    const calls = {
      attach: [] as Array<Record<string, unknown>>,
      reposition: [] as Array<{ x: number; y: number; width: number; height: number }>,
      detach: [] as number[]
    };

    await mockAnimePlayerApi(page, calls);
    await mockAnimeBackend(page);

    const popups: unknown[] = [];
    page.context().on('page', extraPage => popups.push(extraPage));

    await page.setViewportSize({ width: 1000, height: 720 });
    await page.goto('http://127.0.0.1:5173');

    await page.getByRole('heading', { name: 'Test Anime' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test Anime' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /EPISODIOS/ }).click();
    await dialog.getByRole('heading', { name: 'Capítulo 1' }).click();

    // El servidor se selecciona automáticamente (único disponible) y adjunta el reproductor
    // dentro de la app: nada de esto debe abrir una ventana/pestaña nueva.
    await expect.poll(() => calls.attach.length).toBe(1);
    expect(calls.attach[0]).toMatchObject({
      url: 'https://example.test/embed/1',
      referer: 'https://animeav1.com/media/test/1',
      server: 'Test',
      mode: 'embedded'
    });
    expect(calls.attach[0].bounds).toMatchObject({});
    const bounds = calls.attach[0].bounds as { width: number; height: number };
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(popups).toHaveLength(0);
    expect(page.context().pages()).toHaveLength(1);

    // El panel embebido (WebContentsView) reemplaza por completo la UI antigua de ventana aparte.
    await expect(page.getByText('Reproductor protegido')).toHaveCount(0);
    await expect(page.getByText('Reproductor independiente')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir reproductor' })).toHaveCount(0);
    await expect(page.getByTestId('anime-player-panel')).toBeVisible();

    // Redimensionar la ventana debe reposicionar el panel del reproductor, no reabrirlo.
    const attachCountBeforeResize = calls.attach.length;
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect.poll(() => calls.reposition.length).toBeGreaterThan(0);
    const lastBounds = calls.reposition[calls.reposition.length - 1];
    expect(lastBounds.width).toBeGreaterThan(0);
    expect(lastBounds.height).toBeGreaterThan(0);
    expect(calls.attach.length).toBe(attachCountBeforeResize);

    // Cerrar la ficha debe desmontar el reproductor (detach), no dejarlo huérfano.
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => calls.detach.length).toBeGreaterThan(0);
  });
});
