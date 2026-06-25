import { expect, test } from '@playwright/test';

test('online import does not leave a blocking dialog or locked inputs', async ({ page }) => {
  let nativeDialogOpened = false;

  page.on('dialog', async dialog => {
    nativeDialogOpened = true;
    await dialog.dismiss();
  });

  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/settings') {
      return route.fulfill({ json: { theme: 'dark', language: 'es' } });
    }

    if (method === 'GET' && url.pathname === '/settings/ai') {
      return route.fulfill({ json: { enabled: false } });
    }

    if (method === 'GET' && url.pathname === '/downloads') {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/user-list') {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/recommendations') {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/dashboard/summary') {
      return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
    }

    if (method === 'GET' && url.pathname === '/genres') {
      return route.fulfill({ json: ['Action', 'Fantasy'] });
    }

    if (method === 'GET' && url.pathname === '/anime') {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/search') {
      return route.fulfill({
        json: [{
          external_id: 991001,
          source: 'AniList',
          title: 'Mock Import Anime',
          title_romaji: 'Mock Import Anime',
          title_english: 'Mock Import Anime',
          title_japanese: '',
          synopsis: 'Mocked online result for import flow validation.',
          year: 2026,
          season: 'spring',
          status: 'finished',
          type: 'tv',
          episodes: 12,
          duration: 24,
          score: 8.2,
          popularity: 1000,
          cover_image: 'https://example.com/cover.jpg',
          banner_image: '',
          studio: 'Mock Studio',
          source_material: 'manga',
          genres: ['Action']
        }]
      });
    }

    if (method === 'POST' && url.pathname === '/anime/import') {
      return route.fulfill({ json: { id: 777, message: 'imported' } });
    }

    if (method === 'POST' && url.pathname === '/user-list') {
      return route.fulfill({ json: { message: 'added' } });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mock route: ${method} ${url.pathname}` } });
  });

  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: /Buscar Online/i }).click();

  const onlineSearchInput = page.getByPlaceholder(/Escribe el nombre del anime/i);
  await onlineSearchInput.fill('mock import');
  await onlineSearchInput.press('Enter');

  await expect(page.getByText('Mock Import Anime')).toBeVisible();
  await page.getByRole('button', { name: /adir a mi biblioteca/i }).click();

  await expect(page.getByText(/se importó a tu biblioteca local/i)).toBeVisible();
  expect(nativeDialogOpened).toBe(false);

  const topbarSearchInput = page.getByPlaceholder(/Buscar anime en AniList/i);
  await topbarSearchInput.fill('typing still works');
  await expect(topbarSearchInput).toHaveValue('typing still works');
});
