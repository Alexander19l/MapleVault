import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBackup, listBackups, restoreBackup } from '../../src/database/backup';
import { DB_PATH, query, replaceDatabaseFromStaging } from '../../src/database/db';

describe('SQLite backup restore', () => {
  const markerTitle = `Restore marker ${process.pid}`;
  let initialBackupPaths = new Set<string>();

  beforeAll(async () => {
    initialBackupPaths = new Set(listBackups().map(backup => backup.path));
    await query.run('DELETE FROM anime WHERE title LIKE ?', [`${markerTitle}%`]);
  });

  afterAll(async () => {
    await query.run('DELETE FROM anime WHERE title LIKE ?', [`${markerTitle}%`]);

    for (const backup of listBackups()) {
      if (!initialBackupPaths.has(backup.path)) {
        fs.rmSync(backup.path, { force: true });
      }
    }
  });

  it('restaura un snapshot y permite consultar inmediatamente sin reiniciar', async () => {
    const snapshotTitle = `${markerTitle} snapshot`;
    const changedTitle = `${markerTitle} changed`;

    await query.run('INSERT INTO anime (title, source) VALUES (?, ?)', [snapshotTitle, 'restore-test']);
    const backup = await createBackup();
    expect(backup.success).toBe(true);
    expect(backup.path).toBeTruthy();

    await query.run('UPDATE anime SET title = ? WHERE title = ?', [changedTitle, snapshotTitle]);

    const result = await restoreBackup(backup.path!);
    expect(result).toEqual({ success: true });

    const restored = await query.get('SELECT title FROM anime WHERE source = ?', ['restore-test']);
    expect(restored?.title).toBe(snapshotTitle);

    const integrity = await query.get('PRAGMA integrity_check');
    expect(String(Object.values(integrity)[0]).toLowerCase()).toBe('ok');

    await query.run('UPDATE anime SET title = ? WHERE source = ?', [changedTitle, 'restore-test']);
    const updated = await query.get('SELECT title FROM anime WHERE source = ?', ['restore-test']);
    expect(updated?.title).toBe(changedTitle);
  });

  it('rechaza un respaldo corrupto y conserva operativa la base actual', async () => {
    const currentTitle = `${markerTitle} protected`;
    await query.run('DELETE FROM anime WHERE source = ?', ['restore-corrupt-test']);
    await query.run('INSERT INTO anime (title, source) VALUES (?, ?)', [currentTitle, 'restore-corrupt-test']);

    const backupDir = path.join(path.dirname(DB_PATH), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const corruptPath = path.join(backupDir, `corrupt-${process.pid}-${Date.now()}.sqlite`);
    fs.writeFileSync(corruptPath, 'not-a-sqlite-database');

    const result = await restoreBackup(corruptPath);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    const preserved = await query.get('SELECT title FROM anime WHERE source = ?', ['restore-corrupt-test']);
    expect(preserved?.title).toBe(currentTitle);
  });

  it('mantiene las consultas posteriores en cola hasta reabrir la conexión', async () => {
    const snapshotTitle = `${markerTitle} queued snapshot`;
    const changedTitle = `${markerTitle} queued changed`;

    await query.run('DELETE FROM anime WHERE source = ?', ['restore-queue-test']);
    await query.run('INSERT INTO anime (title, source) VALUES (?, ?)', [snapshotTitle, 'restore-queue-test']);
    const backup = await createBackup();
    expect(backup.success).toBe(true);
    expect(backup.path).toBeTruthy();

    await query.run('UPDATE anime SET title = ? WHERE source = ?', [changedTitle, 'restore-queue-test']);

    const stagingPath = path.join(
      path.dirname(DB_PATH),
      `${path.basename(DB_PATH)}.queue-test-${process.pid}-${Date.now()}.tmp`
    );
    fs.copyFileSync(backup.path!, stagingPath);

    const replacement = replaceDatabaseFromStaging(stagingPath);
    const queuedRead = query.get('SELECT title FROM anime WHERE source = ?', ['restore-queue-test']);

    await replacement;
    const row = await queuedRead;
    expect(row?.title).toBe(snapshotTitle);
  });

  it('revierte al archivo original si el reemplazo falla después de cerrar SQLite', async () => {
    const protectedTitle = `${markerTitle} rollback protected`;
    await query.run('DELETE FROM anime WHERE source = ?', ['restore-rollback-test']);
    await query.run('INSERT INTO anime (title, source) VALUES (?, ?)', [protectedTitle, 'restore-rollback-test']);

    const invalidStagingPath = path.join(
      path.dirname(DB_PATH),
      `${path.basename(DB_PATH)}.rollback-test-${process.pid}-${Date.now()}.tmp`
    );
    fs.writeFileSync(invalidStagingPath, 'invalid-sqlite-replacement');

    await expect(replaceDatabaseFromStaging(invalidStagingPath)).rejects.toThrow();

    const preserved = await query.get('SELECT title FROM anime WHERE source = ?', ['restore-rollback-test']);
    expect(preserved?.title).toBe(protectedTitle);

    const integrity = await query.get('PRAGMA integrity_check');
    expect(String(Object.values(integrity)[0]).toLowerCase()).toBe('ok');
  });

  it('conserva solo las tres copias de emergencia más recientes', async () => {
    const backup = await createBackup();
    expect(backup.success).toBe(true);
    expect(backup.path).toBeTruthy();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await restoreBackup(backup.path!);
      expect(result.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    const emergencyBackups = listBackups().filter(item => item.name.startsWith('emergency_before_restore_'));
    expect(emergencyBackups).toHaveLength(3);
  });
});
