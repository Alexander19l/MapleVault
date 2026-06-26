import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { RequestHandler } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantRouter } from '../../src/routes/assistantRoutes';

const queryAllMock = vi.fn<(sql: string) => Promise<unknown[]>>();
const queryRunMock = vi.fn<(sql: string) => Promise<void>>();
const handleChatMessageMock = vi.fn<(message: string) => Promise<Record<string, unknown>>>();
const executeChatbotActionMock = vi.fn<(type: string, data: Record<string, unknown>, token?: string) => Promise<string>>();
const isAllowedChatbotActionMock = vi.fn<(type: string) => boolean>();
const clearAllMemoryMock = vi.fn<() => Promise<void>>();
const getUserSoulDataMock = vi.fn<() => Promise<Record<string, unknown> | null>>();
const buildUserSoulProfileMock = vi.fn<() => Promise<Record<string, unknown>>>();
const capabilitiesProviderMock = vi.fn<() => unknown[]>();
const sanitizeInputMock = vi.fn<(message: string) => string>();
const noRateLimit: RequestHandler = (_req, _res, next) => next();

let server: Server;
let baseUrl: string;

async function requestJson(requestPath: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  return {
    response,
    json: await response.json()
  };
}

describe('Assistant HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(createAssistantRouter({
      queryClient: {
        all: queryAllMock,
        run: queryRunMock
      },
      assistantService: {
        handleChatMessage: handleChatMessageMock as any,
        executeChatbotAction: executeChatbotActionMock as any,
        isAllowedChatbotAction: isAllowedChatbotActionMock as any
      },
      memoryService: {
        clearAllMemory: clearAllMemoryMock as any,
        getUserSoulData: getUserSoulDataMock as any,
        buildUserSoulProfile: buildUserSoulProfileMock as any
      },
      capabilitiesProvider: capabilitiesProviderMock as any,
      sanitizeInput: sanitizeInputMock as any,
      chatRateLimitMiddleware: noRateLimit
    }));

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    capabilitiesProviderMock.mockReturnValue([
      { id: 'buscar_serie', requiresConfirmation: false }
    ]);
    sanitizeInputMock.mockImplementation(message => message.trim());
    handleChatMessageMock.mockResolvedValue({ text: 'Respuesta del asistente' });
    executeChatbotActionMock.mockResolvedValue('Accion ejecutada');
    isAllowedChatbotActionMock.mockReturnValue(true);
    queryAllMock.mockResolvedValue([]);
    queryRunMock.mockResolvedValue();
    clearAllMemoryMock.mockResolvedValue();
    getUserSoulDataMock.mockResolvedValue({ genres: { action: 1 } });
    buildUserSoulProfileMock.mockResolvedValue({ genres: { comedy: 1 } });
  });

  it('expone capacidades dinamicas del asistente', async () => {
    const { response, json } = await requestJson('/chat/capabilities');

    expect(response.status).toBe(200);
    expect(json).toEqual([{ id: 'buscar_serie', requiresConfirmation: false }]);
    expect(capabilitiesProviderMock).toHaveBeenCalledTimes(1);
  });

  it('valida, sanitiza y procesa mensajes de chat', async () => {
    const invalid = await requestJson('/chat/message', {
      method: 'POST',
      body: JSON.stringify({})
    });
    expect(invalid.response.status).toBe(400);

    const valid = await requestJson('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message: '  ayuda  ' })
    });

    expect(valid.response.status).toBe(200);
    expect(valid.json).toEqual({ text: 'Respuesta del asistente' });
    expect(sanitizeInputMock).toHaveBeenCalledWith('  ayuda  ');
    expect(handleChatMessageMock).toHaveBeenCalledWith('ayuda');
  });

  it('rechaza mensajes demasiado largos despues de sanitizar', async () => {
    sanitizeInputMock.mockReturnValueOnce('x'.repeat(2001));

    const { response, json } = await requestJson('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message: 'x' })
    });

    expect(response.status).toBe(400);
    expect(json.error).toContain('2000');
    expect(handleChatMessageMock).not.toHaveBeenCalled();
  });

  it('protege la ejecucion de acciones desconocidas', async () => {
    const missingType = await requestJson('/chat/execute-action', {
      method: 'POST',
      body: JSON.stringify({})
    });
    expect(missingType.response.status).toBe(400);

    isAllowedChatbotActionMock.mockReturnValueOnce(false);
    const blocked = await requestJson('/chat/execute-action', {
      method: 'POST',
      body: JSON.stringify({ type: 'dangerous_action' })
    });

    expect(blocked.response.status).toBe(400);
    expect(blocked.json.error).toContain('no permitido');
    expect(executeChatbotActionMock).not.toHaveBeenCalled();
  });

  it('ejecuta acciones permitidas con datos y token de confirmacion', async () => {
    const { response, json } = await requestJson('/chat/execute-action', {
      method: 'POST',
      body: JSON.stringify({
        type: 'add_to_list',
        data: { animeId: 10 },
        confirmToken: 'abc123'
      })
    });

    expect(response.status).toBe(200);
    expect(json).toEqual({ text: 'Accion ejecutada' });
    expect(executeChatbotActionMock).toHaveBeenCalledWith('add_to_list', { animeId: 10 }, 'abc123');
  });

  it('normaliza historial y descarta JSON invalido en campos visuales', async () => {
    queryAllMock.mockResolvedValueOnce([
      {
        id: 1,
        role: 'assistant',
        content: 'resultado',
        created_at: '2026-06-25T20:00:00.000Z',
        visual_data: '{"items":[1]}',
        action: '{bad-json'
      }
    ]);

    const { response, json } = await requestJson('/chat/history');

    expect(response.status).toBe(200);
    expect(json).toEqual([
      {
        id: 1,
        role: 'assistant',
        content: 'resultado',
        created_at: '2026-06-25T20:00:00.000Z',
        visualData: { items: [1] }
      }
    ]);
    expect(queryAllMock).toHaveBeenCalledWith('SELECT * FROM chat_messages ORDER BY id ASC');
  });

  it('borra historial y memoria sin tocar el motor NLP', async () => {
    const history = await requestJson('/chat/history', { method: 'DELETE' });
    const memory = await requestJson('/chat/memory', { method: 'DELETE' });

    expect(history.response.status).toBe(200);
    expect(memory.response.status).toBe(200);
    expect(queryRunMock).toHaveBeenCalledWith('DELETE FROM chat_messages');
    expect(clearAllMemoryMock).toHaveBeenCalledTimes(1);
    expect(handleChatMessageMock).not.toHaveBeenCalled();
  });

  it('expone y recalcula el perfil de memoria del usuario', async () => {
    const current = await requestJson('/chat/memory/profile');
    const rebuilt = await requestJson('/chat/memory/profile', { method: 'POST' });

    expect(current.response.status).toBe(200);
    expect(current.json).toEqual({ genres: { action: 1 } });
    expect(rebuilt.response.status).toBe(200);
    expect(rebuilt.json.profile).toEqual({ genres: { comedy: 1 } });
  });

  it('expone auditoria reciente de acciones del asistente', async () => {
    queryAllMock.mockResolvedValueOnce([
      {
        id: 9,
        detected_intent: 'agregar_serie',
        execution_status: 'success'
      }
    ]);

    const { response, json } = await requestJson('/chat/actions/history');

    expect(response.status).toBe(200);
    expect(json).toEqual([
      {
        id: 9,
        detected_intent: 'agregar_serie',
        execution_status: 'success'
      }
    ]);
    expect(queryAllMock.mock.calls[0][0]).toContain('FROM assistant_prompt_runs');
  });
});
