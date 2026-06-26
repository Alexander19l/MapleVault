import express from 'express';
import cors from 'cors';
import { initDb } from './database/db';
import { createRateLimitMiddleware } from './security/rateLimiter';
import { createSessionAuthMiddleware } from './security/sessionAuth';
import { createBackup, listBackups } from './database/backup';
import { ensureLibreTranslateRunning, stopLibreTranslateRuntime } from './translation/translationRuntime';
import { createAssistantRouter } from './routes/assistantRoutes';
import { createBackupRouter } from './routes/backupRoutes';
import { createDataTransferRouter } from './routes/dataTransferRoutes';
import { createEpisodeRouter } from './routes/episodeRoutes';
import { invalidateLibraryReadCaches } from './routes/libraryCache';
import { createLibraryRouter } from './routes/libraryRoutes';
import { createSettingsRouter } from './routes/settingsRoutes';
import { createScrapingRouter } from './routes/scrapingRoutes';
import { createSystemRouter } from './routes/systemRoutes';

const app = express();
const parsedPort = Number.parseInt(process.env.PORT || '5000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 5000;
const HOST = process.env.MAPLEVAULT_HOST || '127.0.0.1';

// Configuracin de CORS restrictiva para seguridad local (prevenir CSRF)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('file://') || origin.startsWith('vscode-webview://')) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por la poltica de seguridad CORS de MapleVault (Origen no permitido)'));
    }
  }
}));

// Límite de tamaño de payload: 2MB máximo (previene payloads maliciosos)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Cabeceras de seguridad
app.use((_req: any, res: any, next: any) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  next();
});

// En producción Electron configura un token aleatorio por sesión.
app.use(createSessionAuthMiddleware());

// Rate limiting general
app.use(createRateLimitMiddleware('general'));

app.use(createBackupRouter({ invalidateLibraryReadCaches }));
app.use(createDataTransferRouter({ invalidateLibraryReadCaches }));
app.use(createSettingsRouter());
app.use(createScrapingRouter({ invalidateLibraryReadCaches }));
app.use(createAssistantRouter());
app.use(createEpisodeRouter());
app.use(createLibraryRouter());
app.use(createSystemRouter());

// GET /health - Sondeo de salud del servidor
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
async function start() {
  try {
    await initDb();

    try {
      const translationStatus = await ensureLibreTranslateRunning();
      console.log(`[MapleVault] LibreTranslate: ${translationStatus.state}${translationStatus.command ? ` (${translationStatus.command})` : ''}`);
      if (translationStatus.lastError) {
        console.warn('[MapleVault] LibreTranslate no se pudo iniciar automaticamente:', translationStatus.lastError);
      }
      if (translationStatus.attempts?.length) {
        console.warn('[MapleVault] Intentos de LibreTranslate:', translationStatus.attempts.join(' | '));
      }
      if (translationStatus.installHint) {
        console.warn('[MapleVault] LibreTranslate:', translationStatus.installHint);
      }
    } catch (err: any) {
      console.warn('[MapleVault] Error iniciando LibreTranslate automaticamente:', err.message);
    }

    // Backup automtico al arrancar (si no hay uno reciente < 24h)
    const backups = listBackups();
    const now = Date.now();
    const hasRecentBackup = backups.some(b => {
      const age = now - new Date(b.createdAt).getTime();
      return age < 24 * 60 * 60 * 1000; // menos de 24 horas
    });

    if (!hasRecentBackup) {
      const result = await createBackup();
      if (result.success) {
        console.log(`[MapleVault] Backup automtico creado: ${result.path}`);
      } else {
        console.warn('[MapleVault] No se pudo crear backup automtico:', result.error);
      }
    }

    // Programar backup peridico (cada 24 horas)
    setInterval(async () => {
      try {
        const res = await createBackup();
        if (res.success) {
          console.log(`[MapleVault] Backup peridico creado: ${res.path}`);
        }
      } catch (err: any) {
        console.warn('[MapleVault] Error en backup peridico:', err.message);
      }
    }, 24 * 60 * 60 * 1000);

    app.listen(PORT, HOST, () => {
      console.log(`Servidor de MapleVault corriendo en http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar el servidor de MapleVault:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

process.once('SIGINT', () => {
  stopLibreTranslateRuntime();
  process.exit(0);
});

process.once('SIGTERM', () => {
  stopLibreTranslateRuntime();
  process.exit(0);
});

process.once('exit', () => {
  stopLibreTranslateRuntime();
});

export { app, start };
