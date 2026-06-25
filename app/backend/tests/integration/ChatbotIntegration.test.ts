import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { handleChatMessage } from '../../src/chatbot/chatbot';
import { query } from '../../src/database/db';

describe('Chatbot Integration Tests', () => {
  beforeAll(async () => {
    // Inject seed data manually
    await query.run(`INSERT INTO anime (id, title, status) VALUES (999, 'Test Anime', 'finished')`);
    await query.run(`INSERT INTO user_list (anime_id, watch_status) VALUES (999, 'plan_to_watch')`);
  });

  afterAll(async () => {
    await query.run(`DELETE FROM user_list WHERE anime_id = 999`);
    await query.run(`DELETE FROM anime WHERE id = 999`);
  });

  it('flujo completo de búsqueda de pendientes de prueba en base de datos real local', async () => {
    // Interceptar llamadas a internet pero dejar la DB real funcionando
    global.fetch = vi.fn().mockRejectedValue(new Error('no internet'));

    const response = await handleChatMessage('quiero ver mis pendientes');
    expect(response.message).toBeDefined();
    
    // Debería incluir 'Test Anime' en visual_data
    const data = response.visual_data;
    expect(data?.type).toBe('anime_page');
    expect(data?.data.items.some((a: any) => a.title === 'Test Anime')).toBe(true);
  });
});
