import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { app } from '../../src/server';
import { query } from '../../src/database/db';
import { seedTestData } from '../helpers/setupTestDb';

let server: Server;
let baseUrl: string;

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

  const json = await response.json();
  return { response, json };
}

describe('Chat HTTP endpoints', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  beforeEach(async () => {
    await seedTestData();
  });

  it('GET /chat/capabilities expone contrato, seguridad y acciones confirmables', async () => {
    const { response, json } = await requestJson('/chat/capabilities');

    expect(response.status).toBe(200);
    expect(json.assistant.name).toBe('Maple Assistant');
    expect(json.assistant.product).toBe('MapleVault');
    expect(json.safetyPolicy.writeActionsRequireToken).toBe(true);
    expect(json.endpoints.message).toBe('POST /chat/message');
    expect(json.endpoints.executeAction).toBe('POST /chat/execute-action');
    expect(json.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'discover' }),
        expect.objectContaining({ id: 'library' })
      ])
    );
    expect(json.featuredPrompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: expect.any(String),
          intent: expect.any(String)
        })
      ])
    );

    expect(json.intents.some((intent: any) => intent.id === 'buscar_serie')).toBe(true);
    expect(json.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'delete_anime', requiresConfirmation: true }),
        expect.objectContaining({ type: 'add_anime', requiresConfirmation: true })
      ])
    );
  });

  it('POST /chat/message propone una acción protegida, genera token y audita el prompt', async () => {
    const { response, json } = await requestJson('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message: 'elimina Naruto' })
    });

    expect(response.status).toBe(200);
    expect(json.action).toEqual(expect.objectContaining({
      type: 'delete_anime',
      confirmToken: expect.any(String)
    }));
    expect(json.action.confirmToken.length).toBeGreaterThan(10);
    expect(json.text).toContain('Encontré "Naruto"');

    const naruto = await query.get('SELECT id FROM anime WHERE title = ?', ['Naruto']);
    expect(naruto).toBeDefined();

    const run = await query.get(`
      SELECT detected_intent, selected_tool, requires_confirmation, execution_status
      FROM assistant_prompt_runs
      ORDER BY id DESC
      LIMIT 1
    `);
    expect(run).toMatchObject({
      detected_intent: 'REMOVE_FROM_LIBRARY',
      selected_tool: 'delete_anime',
      requires_confirmation: 1,
      execution_status: 'SUCCESS'
    });
  });

  it('POST /chat/message entrega ayuda compacta con consultas ejecutables', async () => {
    const { response, json } = await requestJson('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message: 'que sabes hacer' })
    });

    expect(response.status).toBe(200);
    expect(json.text).toContain('funciones principales');
    expect(json.visualData).toMatchObject({
      type: 'assistant_help',
      data: {
        categories: expect.any(Array),
        featuredPrompts: expect.any(Array)
      }
    });
    expect(json.visualData.data.featuredPrompts.length).toBeGreaterThan(0);
  });

  it('POST /chat/execute-action rechaza sin token, confirma con token y audita ambos intentos', async () => {
    const proposed = await requestJson('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message: 'elimina Naruto' })
    });

    const action = proposed.json.action;
    expect(action?.type).toBe('delete_anime');

    const rejected = await requestJson('/chat/execute-action', {
      method: 'POST',
      body: JSON.stringify({ type: action.type, data: action.data })
    });
    expect(rejected.response.status).toBe(200);
    expect(rejected.json.text).toContain('requiere una confirmación válida');

    const stillExists = await query.get('SELECT id FROM anime WHERE title = ?', ['Naruto']);
    expect(stillExists).toBeDefined();

    const confirmed = await requestJson('/chat/execute-action', {
      method: 'POST',
      body: JSON.stringify({
        type: action.type,
        data: action.data,
        confirmToken: action.confirmToken
      })
    });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.json.text).toContain('Naruto');
    expect(confirmed.json.text).toContain('eliminado');

    const deleted = await query.get('SELECT id FROM anime WHERE title = ?', ['Naruto']);
    expect(deleted).toBeUndefined();

    const actionRuns = await query.all(`
      SELECT detected_intent, selected_tool, requires_confirmation, execution_status, execution_result
      FROM assistant_prompt_runs
      WHERE detected_intent = 'ACTION_EXECUTION'
      ORDER BY id ASC
    `);

    expect(actionRuns).toHaveLength(2);
    expect(actionRuns[0]).toMatchObject({
      selected_tool: 'delete_anime',
      requires_confirmation: 1,
      execution_status: 'REJECTED'
    });
    expect(actionRuns[1]).toMatchObject({
      selected_tool: 'delete_anime',
      requires_confirmation: 1,
      execution_status: 'SUCCESS'
    });

    const history = await requestJson('/chat/actions/history');
    expect(history.response.status).toBe(200);
    expect(history.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detected_intent: 'ACTION_EXECUTION',
          selected_tool: 'delete_anime',
          execution_status: 'SUCCESS'
        })
      ])
    );
  });
});
