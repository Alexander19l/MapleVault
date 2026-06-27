import express from 'express';
import path from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBackupRouter,
  type BackupService
} from '../../src/routes/backupRoutes';

const createBackupMock = vi.fn<BackupService['createBackup']>();
const listBackupsMock = vi.fn<BackupService['listBackups']>();
const restoreBackupMock = vi.fn<BackupService['restoreBackup']>();
const deleteBackupMock = vi.fn<BackupService['deleteBackup']>();
const invalidateCachesMock = vi.fn();
const clearConfirmationsMock = vi.fn();
const databasePath = path.join(process.cwd(), 'data', 'database.sqlite');

let server: Server;
let baseUrl: string;

async function requestJson(requestPath: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  return {
    response,
    json: await response.json()
  };
}

describe('Backup HTTP router', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createBackupRouter({
      backupService: {
        createBackup: createBackupMock,
        listBackups: listBackupsMock,
        restoreBackup: restoreBackupMock,
        deleteBackup: deleteBackupMock
      },
      databasePath,
      invalidateLibraryReadCaches: invalidateCachesMock,
      clearPendingConfirmations: clearConfirmationsMock
    }));

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createBackupMock.mockResolvedValue({
      success: true,
      path: path.join(path.dirname(databasePath), 'backups', 'maplevault_backup_test.sqlite')
    });
    listBackupsMock.mockReturnValue([
      {
        name: 'maplevault_backup_test.sqlite',
        path: path.join(path.dirname(databasePath), 'backups', 'maplevault_backup_test.sqlite'),
        sizeBytes: 2048,
        createdAt: '2026-06-25T20:00:00.000Z'
      }
    ]);
    restoreBackupMock.mockResolvedValue({ success: true });
    deleteBackupMock.mockReturnValue({ success: true });
  });

  it('mantiene compatibles los endpoints de creación nuevo y heredado', async () => {
    const legacy = await requestJson('/settings/backup', {
      method: 'POST',
      body: '{}'
    });
    const current = await requestJson('/backup/create', {
      method: 'POST',
      body: '{}'
    });

    expect(legacy.response.status).toBe(200);
    expect(legacy.json).toMatchObject({
      message: 'Copia de seguridad creada.',
      filename: 'maplevault_backup_test.sqlite'
    });
    expect(current.response.status).toBe(200);
    expect(current.json).toMatchObject({
      message: 'Copia de seguridad creada con éxito.',
      filename: 'maplevault_backup_test.sqlite'
    });
    expect(createBackupMock).toHaveBeenCalledTimes(2);
  });

  it('lista las copias disponibles sin transformar su contrato', async () => {
    const { response, json } = await requestJson('/backup/list');

    expect(response.status).toBe(200);
    expect(json).toEqual([
      expect.objectContaining({
        name: 'maplevault_backup_test.sqlite',
        sizeBytes: 2048
      })
    ]);
  });

  it('valida restore y solo invalida estado después de restaurar correctamente', async () => {
    const missing = await requestJson('/backup/restore', {
      method: 'POST',
      body: '{}'
    });
    expect(missing.response.status).toBe(400);

    restoreBackupMock.mockResolvedValueOnce({
      success: false,
      error: 'Respaldo inválido.'
    });
    const rejected = await requestJson('/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ backupPath: 'invalid.sqlite' })
    });
    expect(rejected.response.status).toBe(400);
    expect(invalidateCachesMock).not.toHaveBeenCalled();
    expect(clearConfirmationsMock).not.toHaveBeenCalled();

    const restored = await requestJson('/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ backupPath: 'valid.sqlite' })
    });
    expect(restored.response.status).toBe(200);
    expect(restored.json.message).toContain('restaurada correctamente');
    expect(invalidateCachesMock).toHaveBeenCalledTimes(1);
    expect(clearConfirmationsMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza nombres inseguros y resuelve eliminaciones dentro de backups', async () => {
    const invalid = await requestJson('/backup/unsafe..name.sqlite', {
      method: 'DELETE'
    });
    expect(invalid.response.status).toBe(400);
    expect(deleteBackupMock).not.toHaveBeenCalled();

    const validName = 'maplevault_backup_test.sqlite';
    const valid = await requestJson(`/backup/${validName}`, {
      method: 'DELETE'
    });

    expect(valid.response.status).toBe(200);
    expect(deleteBackupMock).toHaveBeenCalledWith(
      path.join(path.dirname(databasePath), 'backups', validName)
    );
  });

  it('convierte errores inesperados del servicio en respuesta 500', async () => {
    createBackupMock.mockRejectedValueOnce(new Error('fallo controlado'));

    const { response, json } = await requestJson('/backup/create', {
      method: 'POST',
      body: '{}'
    });

    expect(response.status).toBe(500);
    expect(json.error).toBe('fallo controlado');
  });
});
