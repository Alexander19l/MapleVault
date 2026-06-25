/**
 * backup.ts — Gestión de backups automáticos de la base de datos SQLite
 * Crea copias de seguridad programáticas y permite restauración
 */
import fs from 'fs';
import path from 'path';
import { DB_PATH, query } from './db';

const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 10; // Conservar los últimos 10 backups

/**
 * Asegura que el directorio de backups existe
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Genera un nombre de archivo de backup con timestamp
 */
function generateBackupName(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `maplevault_backup_${ts}.sqlite`;
}

/**
 * Crea un backup de la base de datos actual
 * Devuelve la ruta del archivo de backup creado
 */
export async function createBackup(): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    ensureBackupDir();

    if (!fs.existsSync(DB_PATH)) {
      return { success: false, error: 'La base de datos no existe todavía.' };
    }

    const backupName = generateBackupName();
    const backupPath = path.join(BACKUP_DIR, backupName);

    // VACUUM INTO crea una copia consistente incluso con WAL activo.
    const escapedBackupPath = backupPath.replace(/'/g, "''");
    await query.run(`VACUUM INTO '${escapedBackupPath}'`);

    console.log(`[Backup] Backup creado exitosamente: ${backupPath}`);

    // Limpiar backups antiguos (conservar solo MAX_BACKUPS)
    pruneOldBackups();

    return { success: true, path: backupPath };
  } catch (err: any) {
    console.error('[Backup] Error al crear backup:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Lista todos los backups disponibles, ordenados del más reciente al más antiguo
 */
export function listBackups(): { name: string; path: string; sizeBytes: number; createdAt: string }[] {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => {
        const fullPath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return files;
  } catch (_) {
    return [];
  }
}

/**
 * Restaura la base de datos desde un backup
 * ADVERTENCIA: Sobrescribe la base de datos actual
 */
export async function restoreBackup(backupPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Validar que el path es seguro (dentro del directorio de backups)
    const resolvedBackup = path.resolve(backupPath);
    const resolvedDir = path.resolve(BACKUP_DIR);
    const relative = path.relative(resolvedDir, resolvedBackup);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { success: false, error: 'Ruta de backup no válida o fuera del directorio permitido.' };
    }

    if (!fs.existsSync(resolvedBackup)) {
      return { success: false, error: 'El archivo de backup no existe.' };
    }

    // Crear un backup de emergencia antes de restaurar
    const emergencyName = `emergency_before_restore_${Date.now()}.sqlite`;
    const emergencyPath = path.join(BACKUP_DIR, emergencyName);
    if (fs.existsSync(DB_PATH)) {
      const escapedEmergencyPath = emergencyPath.replace(/'/g, "''");
      await query.run(`VACUUM INTO '${escapedEmergencyPath}'`);
    }

    // Restaurar
    fs.copyFileSync(resolvedBackup, DB_PATH);
    console.log(`[Backup] Base de datos restaurada desde: ${resolvedBackup}`);

    return { success: true };
  } catch (err: any) {
    console.error('[Backup] Error al restaurar backup:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Elimina backups antiguos, conservando solo MAX_BACKUPS
 */
function pruneOldBackups(): void {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sqlite') && f.startsWith('maplevault_backup_'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      toDelete.forEach(f => {
        fs.unlinkSync(f.path);
        console.log(`[Backup] Backup antiguo eliminado: ${f.name}`);
      });
    }
  } catch (err) {
    console.error('[Backup] Error al limpiar backups antiguos:', err);
  }
}

/**
 * Elimina un backup específico
 */
export function deleteBackup(backupPath: string): { success: boolean; error?: string } {
  try {
    const resolvedBackup = path.resolve(backupPath);
    const resolvedDir = path.resolve(BACKUP_DIR);
    const relative = path.relative(resolvedDir, resolvedBackup);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { success: false, error: 'Ruta fuera del directorio de backups.' };
    }

    if (!fs.existsSync(resolvedBackup)) {
      return { success: false, error: 'Backup no encontrado.' };
    }

    fs.unlinkSync(resolvedBackup);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
