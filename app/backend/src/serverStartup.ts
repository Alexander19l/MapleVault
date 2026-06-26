import { createBackup, listBackups } from './database/backup';
import { ensureLibreTranslateRunning } from './translation/translationRuntime';

export const BACKUP_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const PERIODIC_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface StartupLogger {
  log(message: string): void;
  warn(message: string, detail?: unknown): void;
}

export interface BackupListItem {
  createdAt: string;
  path?: string;
}

export interface BackupResult {
  success: boolean;
  path?: string;
  error?: string;
}

export async function startTranslationRuntime(logger: StartupLogger = console): Promise<void> {
  try {
    const translationStatus = await ensureLibreTranslateRunning();
    logger.log(`[MapleVault] LibreTranslate: ${translationStatus.state}${translationStatus.command ? ` (${translationStatus.command})` : ''}`);
    if (translationStatus.lastError) {
      logger.warn('[MapleVault] LibreTranslate no se pudo iniciar automaticamente:', translationStatus.lastError);
    }
    if (translationStatus.attempts?.length) {
      logger.warn('[MapleVault] Intentos de LibreTranslate:', translationStatus.attempts.join(' | '));
    }
    if (translationStatus.installHint) {
      logger.warn('[MapleVault] LibreTranslate:', translationStatus.installHint);
    }
  } catch (err: any) {
    logger.warn('[MapleVault] Error iniciando LibreTranslate automaticamente:', err.message);
  }
}

export function hasRecentBackup(
  backups: BackupListItem[],
  now = Date.now()
): boolean {
  return backups.some(backup => {
    const age = now - new Date(backup.createdAt).getTime();
    return Number.isFinite(age) && age >= 0 && age < BACKUP_FRESHNESS_MS;
  });
}

export async function ensureStartupBackup({
  listBackupsFn = listBackups,
  createBackupFn = createBackup,
  logger = console,
  now = Date.now()
}: {
  listBackupsFn?: () => BackupListItem[];
  createBackupFn?: () => Promise<BackupResult>;
  logger?: StartupLogger;
  now?: number;
} = {}): Promise<void> {
  if (hasRecentBackup(listBackupsFn(), now)) return;

  const result = await createBackupFn();
  if (result.success) {
    logger.log(`[MapleVault] Backup automatico creado: ${result.path}`);
  } else {
    logger.warn('[MapleVault] No se pudo crear backup automatico:', result.error);
  }
}

export function schedulePeriodicBackups({
  createBackupFn = createBackup,
  logger = console,
  setIntervalFn = setInterval
}: {
  createBackupFn?: () => Promise<BackupResult>;
  logger?: StartupLogger;
  setIntervalFn?: typeof setInterval;
} = {}): NodeJS.Timeout {
  return setIntervalFn(async () => {
    try {
      const result = await createBackupFn();
      if (result.success) {
        logger.log(`[MapleVault] Backup periodico creado: ${result.path}`);
      }
    } catch (err: any) {
      logger.warn('[MapleVault] Error en backup periodico:', err.message);
    }
  }, PERIODIC_BACKUP_INTERVAL_MS);
}
