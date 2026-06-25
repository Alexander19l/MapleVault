import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { 
  setMemory, getMemory, clearAllMemory, 
  addFavoriteGenre, getFavoriteGenres 
} from '../../src/chatbot/memory';
import { DB_PATH } from '../../src/database/db';

describe('MemoryService', () => {
  beforeEach(async () => {
    await clearAllMemory();
  });

  it('debería guardar y recuperar una memoria genérica', async () => {
    await setMemory('user_language', 'es');
    const result = await getMemory('user_language');
    expect(result).toBe('es');
  });

  it('debería sobreescribir una memoria existente', async () => {
    await setMemory('user_language', 'es');
    await setMemory('user_language', 'en');
    const result = await getMemory('user_language');
    expect(result).toBe('en');
  });

  it('debería añadir y recuperar géneros favoritos sin duplicados', async () => {
    await addFavoriteGenre('romance');
    await addFavoriteGenre('Acción');
    await addFavoriteGenre('romance'); // duplicado
    
    const genres = await getFavoriteGenres();
    expect(genres.length).toBe(2);
    expect(genres).toContain('romance');
    expect(genres).toContain('acción');
  });

  it('debería borrar todas las memorias', async () => {
    await setMemory('test_key', 'value');
    await clearAllMemory();
    const result = await getMemory('test_key');
    expect(result).toBeNull();
  });

  it('debería borrar también el perfil persistido en disco', async () => {
    const soulPath = path.join(path.dirname(DB_PATH), 'user_soul.json');
    fs.writeFileSync(soulPath, JSON.stringify({ favoriteGenres: ['acción'] }), 'utf8');

    await clearAllMemory();

    expect(fs.existsSync(soulPath)).toBe(false);
  });
});
