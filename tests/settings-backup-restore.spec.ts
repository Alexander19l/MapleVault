import { expect, test } from '@playwright/test';

test('settings creates and restores SQLite backups without submitting the settings form', async ({ page }) => {
  let settingsSaveCount = 0;
  let createBackupCount = 0;
  let restoredPath = '';
  const backups = [
    {
      name: 'maplevault_backup_2026-06-25_18-00-00-000.sqlite',
      path: 'C:\\MapleVault\\backups\\maplevault_backup_2026-06-25_18-00-00-000.sqlite',
      sizeBytes: 2_097_152,
      createdAt: '2026-06-25T18:00:00.000Z'
    }
  ];

  page.on('dialog', dialog => dialog.accept());

  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/settings') {
      return route.fulfill({ json: { theme: 'dark', language: 'es', closeBehavior: 'ask' } });
    }
    if (method === 'POST' && url.pathname === '/settings') {
      settingsSaveCount += 1;
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
    if (method === 'GET' && url.pathname === '/chat/actions/history') {
      return route.fulfill({ json: [] });
    }
    if (method === 'GET' && url.pathname === '/translation/status') {
      return route.fulfill({ json: { available: false, status: 'unavailable' } });
    }
    if (method === 'GET' && url.pathname === '/backup/list') {
      return route.fulfill({ json: backups });
    }
    if (method === 'POST' && url.pathname === '/settings/backup') {
      createBackupCount += 1;
      backups.unshift({
        name: 'maplevault_backup_2026-06-25_19-00-00-000.sqlite',
        path: 'C:\\MapleVault\\backups\\maplevault_backup_2026-06-25_19-00-00-000.sqlite',
        sizeBytes: 2_359_296,
        createdAt: '2026-06-25T19:00:00.000Z'
      });
      return route.fulfill({
        json: {
          message: 'Copia de seguridad creada.',
          filename: backups[0].name,
          path: backups[0].path
        }
      });
    }
    if (method === 'POST' && url.pathname === '/backup/restore') {
      restoredPath = String(request.postDataJSON()?.backupPath || '');
      return route.fulfill({
        json: { message: 'Base de datos restaurada correctamente. Los cambios ya están disponibles.' }
      });
    }
    if (method === 'GET' && url.pathname === '/dashboard/summary') {
      return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
    }
    if (method === 'GET' && ['/recommendations', '/anime', '/user-list', '/genres'].includes(url.pathname)) {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mock route: ${method} ${url.pathname}` } });
  });

  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: /Ajustes/i }).click();

  await expect(page.getByText('Copias SQLite disponibles')).toBeVisible();
  await expect(page.getByText(backups[0].name)).toBeVisible();

  await page.getByRole('button', { name: 'Respaldar DB SQLite' }).click();
  await expect(page.getByText('maplevault_backup_2026-06-25_19-00-00-000.sqlite', { exact: true })).toBeVisible();
  expect(createBackupCount).toBe(1);
  expect(settingsSaveCount).toBe(0);

  const originalBackupName = 'maplevault_backup_2026-06-25_18-00-00-000.sqlite';
  await page.getByRole('button', { name: `Restaurar ${originalBackupName}` }).click();

  await expect(page.getByText('Base de datos restaurada correctamente. Los cambios ya están disponibles.')).toBeVisible();
  expect(restoredPath).toContain(originalBackupName);
  expect(settingsSaveCount).toBe(0);

  await page.setViewportSize({ width: 720, height: 800 });
  await expect(page.getByText('Copias SQLite disponibles')).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});
