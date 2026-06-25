/**
 * backup.ts — Gestión de backups automáticos de la base de datos SQLite
 * Crea copias de seguridad programáticas y permite restauración
 */
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { DB_PATH, query, replaceDatabaseFromStaging } from './db';

const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 10;
const MAX_EMERGENCY_BACKUPS = 3;
const REQUIRED_TABLES = [
  'anime',
  'genres',
  'anime_genres',
  'user_list',
  'sources',
  'scraping_logs',
  'chat_messages',
  'bot_memory',
  'ai_settings',
  'assistant_prompt_runs',
  'assistant_memory',
  'watched_episodes',
  'anime_relations',
  'anime_translations'
] as const;

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
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  return `maplevault_backup_${ts}.sqlite`;
}

function closeValidationDatabase(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    database.close(error => error ? reject(error) : resolve());
  });
}

async function validateBackupDatabase(backupPath: string): Promise<void> {
  const database = await new Promise<sqlite3.Database>((resolve, reject) => {
    const connection = new sqlite3.Database(backupPath, sqlite3.OPEN_READONLY, error => {
      if (error) reject(error);
      else resolve(connection);
    });
  });

  try {
    const integrityRow = await new Promise<any>((resolve, reject) => {
      database.get('PRAGMA integrity_check', (error, row) => {
        if (error) reject(error);
        else resolve(row);
      });
    });
    const integrityResult = String(Object.values(integrityRow || {})[0] || '').toLowerCase();
    if (integrityResult !== 'ok') {
      throw new Error('El archivo no superó la verificación de integridad de SQLite.');
    }

    const tableRows = await new Promise<Array<{ name: string }>>((resolve, reject) => {
      database.all(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
        (error, rows: Array<{ name: string }>) => {
          if (error) reject(error);
          else resolve(rows || []);
        }
      );
    });
    const availableTables = new Set(tableRows.map(row => row.name));
    const missingTables = REQUIRED_TABLES.filter(table => !availableTables.has(table));
    if (missingTables.length > 0) {
      throw new Error(
        `El respaldo no es compatible con esta versión de MapleVault. Faltan tablas: ${missingTables.join(', ')}.`
      );
    }

    const foreignKeyErrors = await new Promise<any[]>((resolve, reject) => {
      database.all('PRAGMA foreign_key_check', (error, rows) => {
        if (error) reject(error);
        else resolve(rows || []);
      });
    });
    if (foreignKeyErrors.length > 0) {
      throw new Error('El respaldo contiene relaciones inválidas entre registros.');
    }
  } finally {
    await closeValidationDatabase(database);
  }
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
  let stagingPath: string | null = null;

  try {
    ensureBackupDir();

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

    const canonicalBackup = fs.realpathSync(resolvedBackup);
    const canonicalDir = fs.realpathSync(BACKUP_DIR);
    const canonicalRelative = path.relative(canonicalDir, canonicalBackup);
    if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
      return { success: false, error: 'El archivo de backup apunta fuera del directorio permitido.' };
    }

    const backupStat = fs.statSync(canonicalBackup);
    if (!backupStat.isFile() || backupStat.size === 0) {
      return { success: false, error: 'El archivo de backup está vacío o no es un archivo válido.' };
    }

    await validateBackupDatabase(canonicalBackup);

    stagingPath = path.join(
      path.dirname(DB_PATH),
      `${path.basename(DB_PATH)}.restore-${process.pid}-${Date.now()}.tmp`
    );
    const emergencyName = `emergency_before_restore_${Date.now()}.sqlite`;
    const emergencyPath = path.join(BACKUP_DIR, emergencyName);

    fs.copyFileSync(canonicalBackup, stagingPath);
    await validateBackupDatabase(stagingPath);
    await replaceDatabaseFromStaging(
      stagingPath,
      fs.existsSync(DB_PATH) ? emergencyPath : undefined
    );

    console.log(`[Backup] Base de datos restaurada desde: ${canonicalBackup}`);
    pruneOldBackups();

    return { success: true };
  } catch (err: any) {
    console.error('[Backup] Error al restaurar backup:', err.message);
    return { success: false, error: err.message };
  } finally {
    if (stagingPath) {
      fs.rmSync(stagingPath, { force: true });
    }
  }
}

/**
 * Elimina backups antiguos, conservando solo MAX_BACKUPS
 */
function pruneOldBackups(): void {
  try {
    pruneBackupGroup('maplevault_backup_', MAX_BACKUPS);
    pruneBackupGroup('emergency_before_restore_', MAX_EMERGENCY_BACKUPS);
  } catch (err) {
    console.error('[Backup] Error al limpiar backups antiguos:', err);
  }
}

function pruneBackupGroup(prefix: string, maxFiles: number): void {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.sqlite') && file.startsWith(prefix))
    .map(file => {
      const backupPath = path.join(BACKUP_DIR, file);
      return {
        name: file,
        path: backupPath,
        mtime: fs.statSync(backupPath).mtime.getTime()
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const backup of files.slice(maxFiles)) {
    fs.unlinkSync(backup.path);
    console.log(`[Backup] Backup antiguo eliminado: ${backup.name}`);
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
