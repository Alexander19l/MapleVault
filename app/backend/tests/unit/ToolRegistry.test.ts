import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { handleLocalIntent } from '../../src/chatbot/localCommandHandler';
import { NLPResult } from '../../src/chatbot/nlpEngine';
import { query } from '../../src/database/db';

describe('ToolRegistry / LocalCommandHandler', () => {
  beforeAll(async () => {
    const anime = await query.run(
      'INSERT INTO anime (title, source, synopsis, type, status, episodes, score) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        'MapleVault Romance Fixture',
        'tool-registry-test',
        'A local romance fixture used to keep unit tests deterministic without online providers.',
        'tv',
        'completed',
        12,
        8.1
      ]
    );
    await query.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', ['romance']);
    const genre = await query.get('SELECT id FROM genres WHERE name = ? LIMIT 1', ['romance']);
    await query.run(
      'INSERT INTO anime_genres (anime_id, genre_id) VALUES (?, ?)',
      [anime.lastID, genre.id]
    );
  });

  afterAll(async () => {
    await query.run("DELETE FROM anime WHERE source = 'tool-registry-test'");
    await query.run("DELETE FROM genres WHERE name = 'romance' AND id NOT IN (SELECT genre_id FROM anime_genres)");
  });
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
      entities: { genre: 'romance', source: 'local' }
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
