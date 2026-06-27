import { expect, test } from '@playwright/test';

test('muestra la mascota de MapleVault en la marca lateral y en Inicio', async ({ page }) => {
  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/settings') {
      return route.fulfill({ json: { theme: 'dark', language: 'es', closeBehavior: 'ask' } });
    }

    if (method === 'GET' && url.pathname === '/settings/ai') {
      return route.fulfill({ json: { enabled: false } });
    }

    if (method === 'GET' && url.pathname === '/downloads') {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/user-list') {
      return route.fulfill({
        json: [
          { anime_id: 1, watch_status: 'plan_to_watch', favorite: 1 },
          { anime_id: 2, watch_status: 'completed', favorite: 0 }
        ]
      });
    }

    if (method === 'GET' && url.pathname === '/recommendations') {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/dashboard/summary') {
      return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
    }

    if (method === 'GET' && url.pathname === '/anime') {
      return route.fulfill({
        json: [
          { id: 1, title: 'Mock One', status: 'finished', cover_image: '' },
          { id: 2, title: 'Mock Two', status: 'airing', cover_image: '' }
        ]
      });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mock route: ${method} ${url.pathname}` } });
  });

  await page.goto('http://127.0.0.1:5173');

  await expect(page.getByRole('heading', { name: 'MapleVault', exact: true })).toBeVisible();
  await expect(page.getByText('Biblioteca local', { exact: true })).toBeVisible();

  const mascotImages = page.getByAltText('Mascota de MapleVault');
  await expect(mascotImages).toHaveCount(2);
  await expect(mascotImages.first()).toBeVisible();
  await expect(mascotImages.nth(1)).toBeVisible();
});
