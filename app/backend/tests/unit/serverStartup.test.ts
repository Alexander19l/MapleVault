import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FRESHNESS_MS,
  PERIODIC_BACKUP_INTERVAL_MS,
  ensureStartupBackup,
  hasRecentBackup,
  schedulePeriodicBackups
} from '../../src/serverStartup';

function createLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn()
  };
}

describe('Server startup tasks', () => {
  it('detecta backups recientes sin aceptar backups futuros o invalidos', () => {
    const now = new Date('2026-06-26T12:00:00.000Z').getTime();

    expect(hasRecentBackup([
      { createdAt: new Date(now - 1_000).toISOString() }
    ], now)).toBe(true);
    expect(hasRecentBackup([
      { createdAt: new Date(now - BACKUP_FRESHNESS_MS - 1).toISOString() }
    ], now)).toBe(false);
    expect(hasRecentBackup([
      { createdAt: new Date(now + 1_000).toISOString() },
      { createdAt: 'invalid-date' }
    ], now)).toBe(false);
  });

  it('omite backup de arranque cuando ya existe uno reciente', async () => {
    const logger = createLogger();
    const createBackupFn = vi.fn();

    await ensureStartupBackup({
      listBackupsFn: () => [{ createdAt: new Date('2026-06-26T11:00:00.000Z').toISOString() }],
      createBackupFn,
      logger,
      now: new Date('2026-06-26T12:00:00.000Z').getTime()
    });

    expect(createBackupFn).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('crea backup de arranque cuando no hay respaldo reciente', async () => {
    const logger = createLogger();
    const createBackupFn = vi.fn().mockResolvedValue({ success: true, path: 'backup.sqlite' });

    await ensureStartupBackup({
      listBackupsFn: () => [],
      createBackupFn,
      logger,
      now: new Date('2026-06-26T12:00:00.000Z').getTime()
    });

    expect(createBackupFn).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('[MapleVault] Backup automatico creado: backup.sqlite');
  });

  it('programa backup periodico con intervalo de 24 horas', async () => {
    const logger = createLogger();
    const createBackupFn = vi.fn().mockResolvedValue({ success: true, path: 'periodic.sqlite' });
    let scheduledCallback: (() => Promise<void>) | null = null;
    let scheduledMs = 0;
    const timeout = {} as NodeJS.Timeout;
    const setIntervalFn = vi.fn((callback: () => Promise<void>, ms: number) => {
      scheduledCallback = callback;
      scheduledMs = ms;
      return timeout;
    });

    const result = schedulePeriodicBackups({
      createBackupFn,
      logger,
      setIntervalFn: setIntervalFn as any
    });

    expect(result).toBe(timeout);
    expect(scheduledMs).toBe(PERIODIC_BACKUP_INTERVAL_MS);
    await scheduledCallback?.();
    expect(createBackupFn).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('[MapleVault] Backup periodico creado: periodic.sqlite');
  });
});
