import { describe, it, expect } from 'vitest';
import { handleLocalIntent } from '../../src/chatbot/localCommandHandler';
import { NLPResult } from '../../src/chatbot/nlpEngine';

describe('ToolRegistry / LocalCommandHandler', () => {
  it('debería manejar la intención SEARCH_PENDING devolviendo series', async () => {
    const mockNlp: NLPResult = {
      intent: 'SEARCH_PENDING',
      entities: {}
    };
    const response = await handleLocalIntent(mockNlp);
    expect(response.message).toBeDefined();
    expect(response.visual_data).toBeDefined();
    // Validar que la búsqueda no falle
  });

  it('debería manejar SEARCH_ANIME devolviendo animes de la db local o online', async () => {
    const mockNlp: NLPResult = {
      intent: 'SEARCH_ANIME',
      entities: { genre: 'romance' }
    };
    const response = await handleLocalIntent(mockNlp);
    expect(response.message).toBeDefined();
    expect(response.visual_data).toBeDefined();
  });

  it('debería retornar un mensaje si la intención es desconocida', async () => {
    const mockNlp: NLPResult = {
      intent: 'UNKNOWN',
      entities: {}
    } as any;
    const response = await handleLocalIntent(mockNlp);
    expect(response.message).toContain('No entendí');
  });
});
