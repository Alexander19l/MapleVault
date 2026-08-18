import { expect, test } from '@playwright/test';

test('cambia el tema desde Ajustes, lo aplica al instante y lo persiste', async ({ page }) => {
  let savedTheme = 'violet';
  let saveCallCount = 0;

  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/settings') {
      return route.fulfill({ json: { theme: savedTheme, language: 'es', closeBehavior: 'ask' } });
    }
    if (method === 'POST' && url.pathname === '/settings') {
      saveCallCount += 1;
      const body = request.postDataJSON();
      if (body?.theme === 'violet' || body?.theme === 'ember') {
        savedTheme = body.theme;
      }
      return route.fulfill({ json: { message: 'Ajustes guardados.' } });
    }
    if (method === 'GET' && url.pathname === '/settings/ai') {
      return route.fulfill({
        json: {
          provider: 'ollama',
          model: 'llama3.2',
          url: 'http://localhost:11434',
          temperature: 0.3,
          contextLimit: 4096,
          maxTokens: 500,
          enabled: false
        }
      });
    }
    if (method === 'GET' && url.pathname === '/chat/actions/history') return route.fulfill({ json: [] });
    if (method === 'GET' && url.pathname === '/translation/status') return route.fulfill({ json: { available: false, status: 'unavailable' } });
    if (method === 'GET' && url.pathname === '/backup/list') return route.fulfill({ json: [] });
    if (method === 'GET' && url.pathname === '/system/source-candidates') {
      return route.fulfill({
        json: {
          policy: 'fixture',
          playerCapabilities: { httpsEmbed: 'supported', directMp4: 'supported', hls: 'supported', torrent: 'unsupported', note: '' },
          selected: [],
          candidates: []
        }
      });
    }
    if (method === 'GET' && ['/anime', '/user-list', '/recommendations', '/downloads', '/genres'].includes(url.pathname)) {
      return route.fulfill({ json: [] });
    }
    if (method === 'GET' && url.pathname === '/dashboard/summary') return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
    return route.fulfill({ json: [] });
  });

  await page.goto('http://127.0.0.1:5173');

  // Por defecto, sin nada guardado, el tema activo es Violeta.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('violet');

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Apariencia y Sistema' })).toBeVisible();

  const themeGroup = page.getByRole('radiogroup', { name: 'Tema visual' });
  const emberOption = themeGroup.getByRole('radio', { name: /Ember/ });
  const violetOption = themeGroup.getByRole('radio', { name: /Violeta/ });
  await expect(violetOption).toHaveAttribute('aria-checked', 'true');
  await expect(emberOption).toHaveAttribute('aria-checked', 'false');

  // Cambiar a Ember se aplica de inmediato, sin recargar ni reiniciar.
  await emberOption.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('ember');
  await expect(emberOption).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Tema cambiado a Ember.')).toBeVisible();
  expect(saveCallCount).toBe(1);

  // La integración cubre toda la interfaz: el acento naranja se refleja en
  // el token global, legible en cualquier elemento que lo consuma.
  const accentPrimary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
  );
  expect(accentPrimary.toLowerCase()).toBe('#e8590c');

  // Persistencia real: recargar la app sin volver a tocar Ajustes conserva Ember.
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('ember');
});
