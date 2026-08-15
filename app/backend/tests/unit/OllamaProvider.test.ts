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

  it('resuelve intenciones claras por regex sin gastar una llamada a Ollama', async () => {
    const result = await parseIntent('buscame algo de romance');

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities?.genre).toBe('romance');
    expect(result.engine).toBe('regex');
  });

  it('usa Ollama solo cuando regex no reconoce la intencion', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        response: JSON.stringify({
          intent: 'SEARCH_ANIME',
          entities: { animeTitle: 'Naruto', query: 'Naruto' }
        })
      }
    });

    const result = await parseIntent('naruto');

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
    expect(result.entities?.query).toBe('Naruto');
    expect(result.engine).toBe('ollama');
  });

  it('conserva el resultado regex si Ollama no responde', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

    const result = await parseIntent('naruto');

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(result.intent).toBe('UNKNOWN');
    expect(result.engine).toBe('regex');
  });
});
