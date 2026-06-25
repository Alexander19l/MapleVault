import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  decorateAnimeWithSpanishTranslation,
  translateTextForAnime,
  type TranslationSettings
} from '../translationService';

vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}));

const settings: TranslationSettings = {
  enabled: true,
  autoStart: true,
  provider: 'libretranslate',
  url: 'http://localhost:5001',
  apiKey: '',
  targetLanguage: 'es',
  timeoutMs: 1000,
  cacheEnabled: false,
  translateSynopsis: true,
  translateGenres: true,
  translateStatuses: true
};

describe('translationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('traduce texto usando el contrato de LibreTranslate', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { translatedText: 'Una historia sobre amistad y aventura.' }
    });

    const result = await translateTextForAnime({
      entityKey: 'anilist:1',
      field: 'synopsis',
      text: 'A story about friendship and adventure across a dangerous world.',
      settings
    });

    expect(result.text).toBe('Una historia sobre amistad y aventura.');
    expect(result.translated).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:5001/translate',
      expect.objectContaining({
        q: 'A story about friendship and adventure across a dangerous world.',
        source: 'auto',
        target: 'es',
        format: 'text'
      }),
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it('no falla la traduccion si el cache recibe un id externo que no existe localmente', async () => {
    const uniqueKey = `anilist:external-cache-${Date.now()}`;
    const sourceText = `A long external synopsis that should be translated and cached safely ${Date.now()}.`;
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { translatedText: 'Texto traducido desde una busqueda externa.' }
    });

    const result = await translateTextForAnime({
      animeId: 987654321,
      entityKey: uniqueKey,
      field: 'synopsis',
      text: sourceText,
      settings: { ...settings, cacheEnabled: true }
    });

    expect(result.text).toBe('Texto traducido desde una busqueda externa.');
    expect(result.translated).toBe(true);
    expect(result.status).toBe('translated');
  });

  it('conserva texto original cuando la traduccion esta desactivada', async () => {
    const anime: any = await decorateAnimeWithSpanishTranslation({
      id: 10,
      title: 'Example',
      synopsis: 'A story about friendship and adventure across a dangerous world.',
      genres: ['Action'],
      status: 'finished',
      type: 'tv'
    }, { ...settings, enabled: false });

    expect(anime.synopsis).toBe('A story about friendship and adventure across a dangerous world.');
    expect(anime.synopsis_original).toBe('A story about friendship and adventure across a dangerous world.');
    expect(anime.genres_es).toEqual(['Accion']);
    expect(anime.status_label_es).toBe('Finalizado');
    expect(axios.post).not.toHaveBeenCalled();
  });
});
