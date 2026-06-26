import path from 'path';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import { clearPendingActions } from '../chatbot/actionConfirmation';
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup
} from '../database/backup';
import { DB_PATH } from '../database/db';
import { getErrorMessage as getSharedErrorMessage } from './routeUtils';

export interface BackupService {
  createBackup: typeof createBackup;
  listBackups: typeof listBackups;
  restoreBackup: typeof restoreBackup;
  deleteBackup: typeof deleteBackup;
}

interface BackupRouterDependencies {
  backupService?: BackupService;
  databasePath?: string;
  invalidateLibraryReadCaches?: () => void;
  clearPendingConfirmations?: () => void;
}

const defaultBackupService: BackupService = {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup
};

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno al procesar la copia de seguridad.');
}

export function createBackupRouter({
  backupService = defaultBackupService,
  databasePath = DB_PATH,
  invalidateLibraryReadCaches = () => undefined,
  clearPendingConfirmations = clearPendingActions
}: BackupRouterDependencies = {}) {
  const router = Router();

  const createBackupHandler = (successMessage: string): RequestHandler => async (_req, res) => {
    try {
      const result = await backupService.createBackup();
      if (!result.success) {
        return res.status(500).json({
          error: result.error || 'No se pudo crear la copia de seguridad.'
        });
      }

      res.json({
        message: successMessage,
        path: result.path,
        filename: result.path ? path.basename(result.path) : null
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  router.post('/settings/backup', createBackupHandler('Copia de seguridad creada.'));
  router.get('/backup/list', (_req, res) => {
    try {
      res.json(backupService.listBackups());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  router.post('/backup/create', createBackupHandler('Copia de seguridad creada con éxito.'));

  router.post('/backup/restore', async (req, res) => {
    try {
      const { backupPath } = req.body;
      if (!backupPath || typeof backupPath !== 'string') {
        return res.status(400).json({ error: 'Se requiere el campo backupPath.' });
      }

      const result = await backupService.restoreBackup(backupPath);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      invalidateLibraryReadCaches();
      clearPendingConfirmations();
      res.json({
        message: 'Base de datos restaurada correctamente. Los cambios ya están disponibles.'
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.delete('/backup/:name', (req, res) => {
    try {
      const name = req.params.name;
      if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        return res.status(400).json({
          error: 'Nombre de copia de seguridad no válido.'
        });
      }

      const backupPath = path.join(path.dirname(databasePath), 'backups', name);
      const result = backupService.deleteBackup(backupPath);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ message: 'Copia de seguridad eliminada.' });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}
