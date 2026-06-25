import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { handleChatMessage } from '../../src/chatbot/chatbot';
import { handleLocalIntent } from '../../src/chatbot/localCommandHandler';
import { parseIntent } from '../../src/chatbot/nlpEngine';
import { seedTestData } from '../helpers/setupTestDb';
import { query } from '../../src/database/db';
import { getAssistantMemory } from '../../src/chatbot/memory';
import * as aiSettings from '../../src/chatbot/aiSettings';
import * as nlpEngine from '../../src/chatbot/nlpEngine';

describe('Batería de Pruebas: Llama 3.2 y Chatbot', () => {

  beforeAll(async () => {
    // 1. Inicializar la BD con datos de prueba definidos en la semilla
    await seedTestData();
    
    // 2. Mockear la configuración de IA para forzar el uso de Ollama local simulado en las integraciones
    // Nota: Para probar Llama real, tendríamos que levantar Ollama. En entorno de CI se mockea la red.
    // Sin embargo, para probar el flujo NLP completo, mockearemos la respuesta de axios dentro de nlpEngine
    // o mockearemos parseIntent si solo queremos probar el manejador local.
  });

  describe('1. Pruebas de Memoria Inicial y Registro (assistant_memory & logs)', () => {
    it('debería haber insertado la memoria inicial correcta', async () => {
      const lang = await getAssistantMemory('preferred_language');
      expect(lang).toBe('español');

      const confirm = await getAssistantMemory('confirm_before_changes');
      expect(confirm).toBe(true);

      const favs = await getAssistantMemory('favorite_genres');
      expect(favs).toEqual([]);
    });

    it('debería registrar una ejecución en assistant_prompt_runs', async () => {
      // Mockear NLP para no requerir Ollama
      vi.spyOn(nlpEngine, 'parseIntent').mockResolvedValueOnce({
        intent: 'GREETING',
        entities: {}
      });

      await handleChatMessage('Hola asistente');
      
      const runs = await query.all('SELECT * FROM assistant_prompt_runs ORDER BY id DESC LIMIT 1');
      expect(runs.length).toBe(1);
      expect(runs[0].user_prompt).toBe('Hola asistente');
      expect(runs[0].detected_intent).toBe('GREETING');
      expect(runs[0].latency_ms).toBeDefined();
    });
  });

  describe('2. Pruebas de Biblioteca y Búsqueda', () => {
    it('debería buscar anime por título en local', async () => {
      const response = await handleLocalIntent({ intent: 'SEARCH_ANIME', entities: { animeTitle: 'Naruto' } });
      expect(response.text).toContain('resultado para "Naruto"');
    });

    it('debería buscar anime por género (romance)', async () => {
      const response = await handleLocalIntent({ intent: 'SEARCH_ANIME', entities: { genre: 'romance' } });
      expect(response.visualData?.data.items.length).toBeGreaterThan(0);
      expect(response.visualData?.data.items[0].title).toBe('Your Name');
    });

    it('debería buscar anime por año (2020)', async () => {
      const response = await handleLocalIntent({ intent: 'SEARCH_ANIME', entities: { year: 2020 } });
      expect(response.visualData?.data.items[0].title).toBe('Jujutsu Kaisen');
    });

    it('debería devolver las series completadas', async () => {
      const response = await handleLocalIntent({ intent: 'SEARCH_COMPLETED', entities: {} });
      const titles = response.visualData?.data.items.map((a: any) => a.title);
      expect(titles).toContain('Death Note');
      expect(titles).toContain('Your Name');
      expect(titles).not.toContain('Naruto');
    });

    it('debería devolver las series pendientes', async () => {
      const response = await handleLocalIntent({ intent: 'SEARCH_PENDING', entities: {} });
      const titles = response.visualData?.data.items.map((a: any) => a.title);
      expect(titles).toContain('Naruto');
      expect(titles).toContain('Monster');
    });
  });

  describe('3. Pruebas de Capítulos y Confirmación de Seguridad', () => {
    it('debería pedir confirmación antes de eliminar una serie de la biblioteca', async () => {
      const response = await handleLocalIntent({ intent: 'REMOVE_FROM_LIBRARY', entities: { animeTitle: 'Naruto' } });
      expect(response.action).toBeDefined();
      expect(response.action?.type).toBe('delete_anime');
      expect(response.text).toContain('seguro de que deseas eliminarlo');
    });

    it('debería pedir confirmación masiva para marcar todo como visto', async () => {
      const response = await handleLocalIntent({ intent: 'MARK_ALL_WATCHED', entities: {} });
      expect(response.action).toBeDefined();
      expect(response.action?.type).toBe('mark_all_watched');
    });

    it('debería mostrar capítulos pendientes', async () => {
      const response = await handleLocalIntent({ intent: 'FILTER_EPISODES_PENDING', entities: {} });
      expect(response.text).toContain('Jujutsu Kaisen');
      expect(response.text).toContain('Capítulo 3');
      expect(response.text).toContain('Frieren');
      expect(response.text).toContain('Capítulo 2');
    });

    it('debería mostrar el último capítulo visto', async () => {
      const response = await handleLocalIntent({ intent: 'LAST_WATCHED_EPISODE', entities: {} });
      expect(response.text).toContain('Frieren');
      expect(response.text).toContain('Episodio 1'); // Insertado último en seed
    });
  });

  describe('4. Actualización de Memoria', () => {
    it('debería guardar la preferencia de género', async () => {
      await handleLocalIntent({ intent: 'REMEMBER_PREFERENCE', entities: { genre: 'psicológico' } });
      const favs = await getAssistantMemory<string[]>('favorite_genres');
      expect(favs).toContain('psicológico');
    });

    it('debería recuperar la preferencia de género', async () => {
      const response = await handleLocalIntent({ intent: 'RECALL_PREFERENCE', entities: {} });
      expect(response.text).toContain('psicológico');
    });

    it('debería usar géneros favoritos para recomendar si general', async () => {
      const response = await handleLocalIntent({ intent: 'RECOMMEND_GENERAL', entities: {} });
      // Monster o Death Note tienen psicológico
      expect(response.visualData).toBeDefined();
    });
  });

  describe('5. Pruebas de Offline / No-Network Fallback', () => {
    it('debería funcionar el nlpEngine con regex (offline fallback) si el proveedor IA falla', async () => {
      vi.spyOn(aiSettings, 'getAISettings').mockRejectedValueOnce(new Error('Network error'));
      const result = await parseIntent('busca dragon ball');
      expect(result.intent).toBe('SEARCH_ANIME');
      expect(result.entities.animeTitle).toBe('dragon ball');
    });
  });

  describe('6. Análisis y Estadísticas', () => {
    it('debería mostrar estadísticas de la biblioteca', async () => {
      const response = await handleLocalIntent({ intent: 'LIBRARY_STATS', entities: {} });
      expect(response.text).toContain('Tienes un total de **6** animes');
    });

    it('debería detectar si no hay duplicados', async () => {
      const response = await handleLocalIntent({ intent: 'FIND_DUPLICATES', entities: {} });
      expect(response.text).toContain('limpia');
    });
  });

});
