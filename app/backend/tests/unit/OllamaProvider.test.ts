import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { parseIntent } from '../../src/chatbot/nlpEngine';
import { getAISettings } from '../../src/chatbot/aiSettings';

vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}));

vi.mock('../../src/chatbot/aiSettings', () => ({
  getAISettings: vi.fn(),
  getAiSettings: vi.fn()
}));

const mockedAxios = vi.mocked(axios);
const mockedGetAISettings = vi.mocked(getAISettings);

describe('OllamaProvider / NLPEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAISettings.mockResolvedValue({
      enabled: true,
      provider: 'ollama',
      model: 'llama3.2',
      url: 'http://localhost:11434',
      temperature: 0.1,
      contextLimit: 8192,
      maxTokens: 1000
    });
  });

  it('deberia conectarse a Ollama y retornar intencion valida', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        response: JSON.stringify({
          intent: 'SEARCH_ANIME',
          entities: { genre: 'romance' }
        })
      }
    });

    const result = await parseIntent('buscame algo de romance');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        model: 'llama3.2',
        stream: false,
        format: 'json'
      }),
      expect.objectContaining({
        timeout: 5000,
        maxRedirects: 0
      })
    );
    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities?.genre).toBe('romance');
  });

  it('deberia caer a regex si Ollama no responde', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

    const result = await parseIntent('buscame algo');

    expect(result.intent).toBe('SEARCH_ANIME');
  });
});
