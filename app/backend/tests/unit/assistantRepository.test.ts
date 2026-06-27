import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearChatHistory,
  getAssistantActionHistory,
  getChatHistory,
  parseAssistantJsonField
} from '../../src/routes/assistantRepository';

const queryAllMock = vi.fn<(sql: string, params?: any[]) => Promise<any[]>>();
const queryRunMock = vi.fn<(sql: string, params?: any[]) => Promise<unknown>>();

const queryClient = {
  all: queryAllMock,
  run: queryRunMock
};

describe('assistantRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAllMock.mockResolvedValue([]);
    queryRunMock.mockResolvedValue({ changes: 1 });
  });

  it('parsea campos JSON del asistente sin filtrar errores al usuario', () => {
    expect(parseAssistantJsonField('{"items":[1]}')).toEqual({ items: [1] });
    expect(parseAssistantJsonField('{bad-json')).toBeUndefined();
    expect(parseAssistantJsonField(null)).toBeUndefined();
    expect(parseAssistantJsonField('')).toBeUndefined();
  });

  it('normaliza el historial de chat y descarta JSON invalido', async () => {
    queryAllMock.mockResolvedValueOnce([
      {
        id: 1,
        role: 'assistant',
        content: 'resultado',
        created_at: '2026-06-25T20:00:00.000Z',
        visual_data: '{"items":[1]}',
        action: '{"type":"add_to_list"}'
      },
      {
        id: 2,
        role: 'assistant',
        content: 'otro resultado',
        created_at: '2026-06-25T20:01:00.000Z',
        visual_data: '{bad-json',
        action: null
      }
    ]);

    await expect(getChatHistory(queryClient)).resolves.toEqual([
      {
        id: 1,
        role: 'assistant',
        content: 'resultado',
        created_at: '2026-06-25T20:00:00.000Z',
        visualData: { items: [1] },
        action: { type: 'add_to_list' }
      },
      {
        id: 2,
        role: 'assistant',
        content: 'otro resultado',
        created_at: '2026-06-25T20:01:00.000Z',
        visualData: undefined,
        action: undefined
      }
    ]);
    expect(queryAllMock).toHaveBeenCalledWith('SELECT * FROM chat_messages ORDER BY id ASC');
  });

  it('borra el historial del chat sin tocar otras tablas de memoria', async () => {
    await clearChatHistory(queryClient);

    expect(queryRunMock).toHaveBeenCalledWith('DELETE FROM chat_messages');
  });

  it('lee solo la auditoria reciente del asistente', async () => {
    queryAllMock.mockResolvedValueOnce([{ id: 9, detected_intent: 'agregar_serie' }]);

    await expect(getAssistantActionHistory(queryClient)).resolves.toEqual([
      { id: 9, detected_intent: 'agregar_serie' }
    ]);

    expect(queryAllMock).toHaveBeenCalledTimes(1);
    expect(queryAllMock.mock.calls[0][0]).toContain('FROM assistant_prompt_runs');
    expect(queryAllMock.mock.calls[0][0]).toContain('ORDER BY id DESC');
    expect(queryAllMock.mock.calls[0][0]).toContain('LIMIT 100');
  });
});
