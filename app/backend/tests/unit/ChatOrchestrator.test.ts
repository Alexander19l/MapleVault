import { describe, it, expect, vi } from 'vitest';
import { handleChatMessage } from '../../src/chatbot/chatbot';
import * as nlpEngine from '../../src/chatbot/nlpEngine';
import * as localCommandHandler from '../../src/chatbot/localCommandHandler';

describe('ChatOrchestrator', () => {
  it('debería enrutar el mensaje al motor NLP y luego al localCommandHandler', async () => {
    // Mockear NLP y Comando local para evitar interacciones reales
    const nlpSpy = vi.spyOn(nlpEngine, 'parseIntent').mockResolvedValue({
      intent: 'SEARCH_PENDING',
      entities: {}
    });
    
    const handlerSpy = vi.spyOn(localCommandHandler, 'handleLocalIntent').mockResolvedValue({
      message: 'Aquí están tus pendientes',
      visual_data: { type: 'anime_list', data: [] }
    });

    const result = await handleChatMessage('quiero ver mis pendientes');

    expect(nlpSpy).toHaveBeenCalled();
    expect(handlerSpy).toHaveBeenCalled();
    expect(result.message).toBe('Aquí están tus pendientes');

    nlpSpy.mockRestore();
    handlerSpy.mockRestore();
  });
});
