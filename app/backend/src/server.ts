import express from 'express';
import cors from 'cors';
import { initDb } from './database/db';
import { createRateLimitMiddleware } from './security/rateLimiter';
import { createSessionAuthMiddleware } from './security/sessionAuth';
import { isAllowedCorsOrigin } from './security/corsPolicy';
import { stopLibreTranslateRuntime } from './translation/translationRuntime';
import { createAssistantRouter } from './routes/assistantRoutes';
import { createBackupRouter } from './routes/backupRoutes';
import { createDataTransferRouter } from './routes/dataTransferRoutes';
import { createEpisodeRouter } from './routes/episodeRoutes';
import { invalidateLibraryReadCaches } from './routes/libraryCache';
import { createLibraryRouter } from './routes/libraryRoutes';
import { createMangaRouter } from './routes/mangaRoutes';
import { createSettingsRouter } from './routes/settingsRoutes';
import { createScrapingRouter } from './routes/scrapingRoutes';
import { createSystemRouter } from './routes/systemRoutes';
import {
  ensureStartupBackup,
  schedulePeriodicBackups,
  startTranslationRuntime
} from './serverStartup';

const app = express();
const parsedPort = Number.parseInt(process.env.PORT || '5000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 5000;
const HOST = process.env.MAPLEVAULT_HOST || '127.0.0.1';
const INSTANCE_ID = process.env.MAPLEVAULT_INSTANCE_ID || '';
const HAS_SESSION_TOKEN = Boolean(process.env.MAPLEVAULT_API_TOKEN);

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedCorsOrigin(origin, HAS_SESSION_TOKEN)) {
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
app.use(createMangaRouter());
app.use(createSystemRouter());

// GET /health - Sondeo de salud del servidor
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ...(INSTANCE_ID ? { instanceId: INSTANCE_ID } : {})
  });
});

// 404 - Ruta no encontrada
app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Handler de errores global
app.use((err: any, _req: any, res: any, next: any) => {
  console.error('Error no controlado en la API de MapleVault:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
async function start() {
  try {
    await initDb();
    await startTranslationRuntime();
    await ensureStartupBackup();
    schedulePeriodicBackups();

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
