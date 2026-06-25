import { expect, test } from '@playwright/test';

type MockDesktopApiOptions = {
  chatHistory?: any[];
};

const mockDesktopApi = async (
  page: import('@playwright/test').Page,
  options: MockDesktopApiOptions = {}
) => {
  let executeActionCalls = 0;
  let chatHistory = [...(options.chatHistory || [])];

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

    if (method === 'GET' && url.pathname === '/chat/history') {
      return route.fulfill({ json: chatHistory });
    }

    if (method === 'GET' && url.pathname === '/chat/capabilities') {
      return route.fulfill({ json: { categories: [], intents: [], featuredPrompts: [] } });
    }

    if (method === 'DELETE' && url.pathname === '/chat/history') {
      chatHistory = [];
      return route.fulfill({ json: { success: true } });
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

    if (method === 'POST' && url.pathname === '/chat/message') {
      const body = request.postDataJSON();
      const message = String(body?.message || '').toLowerCase();
      const createdAt = new Date().toISOString();
      const userHistory = {
        id: chatHistory.length + 1,
        role: 'user',
        content: String(body?.message || ''),
        created_at: createdAt
      };

      if (message.includes('agrega')) {
        const response = {
          text: 'Encontré "Mock Action". Confirma si quieres agregarla como plan_to_watch.',
          action: {
            type: 'add_anime',
            data: {
              external_id: 99001,
              source: 'AniList',
              title: 'Mock Action',
              studio: 'Mock Studio',
              genres: ['Action']
            },
            confirmMessage: 'Agregar Mock Action como plan_to_watch',
            confirmToken: 'test-token'
          }
        };

        chatHistory = [
          ...chatHistory,
          userHistory,
          {
            id: chatHistory.length + 2,
            role: 'assistant',
            content: response.text,
            action: response.action,
            created_at: createdAt
          }
        ];

        return route.fulfill({ json: response });
      }

      const response = {
        text: 'Te podría gustar:\n1. Mock Action: coincide con tus preferencias de acción.',
        visualData: {
          type: 'anime_list',
          data: [{
            id: 501,
            title: 'Mock Action',
            studio: 'Mock Studio',
            year: 2026,
            episodes: 12,
            score: 8.4,
            type: 'tv',
            genres: ['Action'],
            cover_image: ''
          }]
        }
      };

      chatHistory = [
        ...chatHistory,
        userHistory,
        {
          id: chatHistory.length + 2,
          role: 'assistant',
          content: response.text,
          visualData: response.visualData,
          created_at: createdAt
        }
      ];

      return route.fulfill({ json: response });
    }

    if (method === 'POST' && url.pathname === '/chat/execute-action') {
      executeActionCalls += 1;
      return route.fulfill({ json: { message: 'Listo. Mock Action fue agregado a tu biblioteca.' } });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mock route: ${method} ${url.pathname}` } });
  });

  return {
    getExecuteActionCalls: () => executeActionCalls
  };
};

test.describe('Maple Assistant', () => {
  test('abre el panel, envía una recomendación y muestra datos visuales', async ({ page }) => {
    await mockDesktopApi(page);
    const deferredModuleRequests: string[] = [];
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (
        pathname.endsWith('/src/components/markdown-text.tsx')
        || pathname.endsWith('/src/components/chatbot/MapleToolCall.tsx')
      ) {
        deferredModuleRequests.push(pathname);
      }
    });

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: /Abrir Maple Assistant/i }).click();

    await expect(page.getByText('Maple Assistant')).toBeVisible();
    await expect(page.getByText('Motor local activo')).toBeVisible();

    const input = page.getByPlaceholder('Escribe un mensaje...');
    await expect(input).toBeVisible();
    expect(deferredModuleRequests).toEqual([]);

    await input.fill('recomendame acción');
    await input.press('Enter');

    await expect(page.getByText(/Te podría gustar/i)).toBeVisible();
    await expect(page.getByText('Mock Action').first()).toBeVisible();
    await expect.poll(() => deferredModuleRequests.some(path => path.endsWith('/markdown-text.tsx'))).toBe(true);
    await expect.poll(() => deferredModuleRequests.some(path => path.endsWith('/MapleToolCall.tsx'))).toBe(true);
  });

  test('muestra confirmación para acciones protegidas y no ejecuta sin click explícito', async ({ page }) => {
    const apiState = await mockDesktopApi(page);

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: /Abrir Maple Assistant/i }).click();

    const input = page.getByPlaceholder('Escribe un mensaje...');
    await input.fill('agrega el 1');
    await input.press('Enter');

    await expect(page.getByText(/Confirma si quieres agregarla/i)).toBeVisible();
    expect(apiState.getExecuteActionCalls()).toBe(0);

    await page.getByRole('button', { name: /Confirmar/i }).click();
    await expect.poll(() => apiState.getExecuteActionCalls()).toBe(1);
  });

  test('cierra y vuelve a abrir el panel sin dejar una capa congelada', async ({ page }) => {
    await mockDesktopApi(page);

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: /Abrir Maple Assistant/i }).click();

    await expect(page.getByRole('button', { name: 'Cerrar Maple Assistant' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar Maple Assistant' }).click();

    await expect(page.getByRole('button', { name: 'Cerrar Maple Assistant' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Abrir Maple Assistant/i })).toBeVisible();

    await page.getByRole('button', { name: /Abrir Maple Assistant/i }).click();
    await expect(page.getByRole('button', { name: 'Cerrar Maple Assistant' })).toBeVisible();
  });

  test('restaura historial persistido al reabrir Maple Assistant', async ({ page }) => {
    await mockDesktopApi(page, {
      chatHistory: [
        {
          id: 1,
          role: 'user',
          content: 'busca frieren',
          created_at: '2026-06-22T10:00:00.000Z'
        },
        {
          id: 2,
          role: 'assistant',
          content: 'Encontré 1 resultado persistido para "frieren".',
          visualData: {
            type: 'anime_list',
            data: [{
              id: 777,
              title: 'Frieren Persistida',
              studio: 'Madhouse',
              year: 2023,
              episodes: 28,
              score: 9.3,
              type: 'tv',
              genres: ['Fantasy'],
              cover_image: ''
            }]
          },
          created_at: '2026-06-22T10:00:01.000Z'
        }
      ]
    });

    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: /Abrir Maple Assistant/i }).click();

    await expect(page.getByText('busca frieren')).toBeVisible();
    await expect(page.getByText('Frieren Persistida')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar Maple Assistant' }).click();
    await expect(page.getByRole('button', { name: 'Cerrar Maple Assistant' })).toHaveCount(0);

    await page.getByRole('button', { name: /Abrir Maple Assistant/i }).click();
    await expect(page.getByText('busca frieren')).toBeVisible();
    await expect(page.getByText('Frieren Persistida')).toBeVisible();
  });
});
