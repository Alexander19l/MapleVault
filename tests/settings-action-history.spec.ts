import { expect, test } from '@playwright/test';

test('settings shows Maple Assistant action history', async ({ page }) => {
  await page.route('http://localhost:5000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/settings') {
      return route.fulfill({ json: { theme: 'dark', language: 'es', closeBehavior: 'ask' } });
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

    if (method === 'GET' && ['/downloads', '/user-list', '/recommendations', '/anime'].includes(url.pathname)) {
      return route.fulfill({ json: [] });
    }

    if (method === 'GET' && url.pathname === '/genres') {
      return route.fulfill({ json: ['Action', 'Fantasy'] });
    }

    if (method === 'GET' && url.pathname === '/dashboard/summary') {
      return route.fulfill({ json: { recent: [], airing: [], stats: {} } });
    }

    if (method === 'GET' && url.pathname === '/translation/status') {
      return route.fulfill({ json: { available: false, status: 'unavailable' } });
    }

    if (method === 'GET' && url.pathname === '/chat/actions/history') {
      return route.fulfill({
        json: [
          {
            id: 12,
            user_prompt: '[execute-action:delete_anime]',
            detected_intent: 'ACTION_EXECUTION',
            nlp_engine: 'system',
            selected_tool: 'delete_anime',
            requires_confirmation: 1,
            execution_status: 'SUCCESS',
            latency_ms: 18,
            error_message: null,
            created_at: '2026-06-21T22:00:00.000Z'
          },
          {
            id: 11,
            user_prompt: '[execute-action:delete_anime]',
            detected_intent: 'ACTION_EXECUTION',
            nlp_engine: 'system',
            selected_tool: 'delete_anime',
            requires_confirmation: 1,
            execution_status: 'REJECTED',
            latency_ms: 7,
            error_message: null,
            created_at: '2026-06-21T21:59:55.000Z'
          },
          {
            id: 10,
            user_prompt: 'elimina Naruto',
            detected_intent: 'REMOVE_FROM_LIBRARY',
            nlp_engine: 'regex',
            selected_tool: 'delete_anime',
            requires_confirmation: 1,
            execution_status: 'SUCCESS',
            latency_ms: 24,
            error_message: null,
            created_at: '2026-06-21T21:59:50.000Z'
          },
          {
            id: 9,
            user_prompt: 'mi catálogo',
            detected_intent: 'VIEW_CATALOG',
            nlp_engine: 'regex',
            selected_tool: 'none',
            requires_confirmation: 0,
            execution_status: 'SUCCESS',
            latency_ms: 11,
            error_message: null,
            created_at: '2026-06-21T21:59:40.000Z'
          }
        ]
      });
    }

    if (method === 'GET' && url.pathname === '/backup/list') {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mock route: ${method} ${url.pathname}` } });
  });

  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: /Ajustes/i }).click();

  await expect(page.getByText('Historial de Acciones de Maple Assistant')).toBeVisible();
  await expect(page.getByText('ACTION_EXECUTION').first()).toBeVisible();
  await expect(page.getByText('delete_anime').first()).toBeVisible();
  await expect(page.getByText('Confirmación').first()).toBeVisible();
  await expect(page.getByText('18 ms')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Correctos (3)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rechazados (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sin confirmación (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'Rechazados (1)' }).click();
  await expect(page.getByText('7 ms')).toBeVisible();
  await expect(page.getByText('18 ms')).not.toBeVisible();

  await page.getByRole('button', { name: 'Todos (4)' }).click();
  await page.getByRole('button', { name: 'Sin confirmación (1)' }).click();
  await expect(page.getByText('VIEW_CATALOG')).toBeVisible();
  await expect(page.getByText('11 ms')).toBeVisible();
  await expect(page.getByText('delete_anime').first()).not.toBeVisible();
});
