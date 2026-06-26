import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { resolveWindowIconPath } from './desktopAssets';

let splashWindow: BrowserWindow | null = null;
let errorWindow: BrowserWindow | null = null;

export function showSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: resolveWindowIconPath(),
    backgroundColor: '#0D0F14',
    webPreferences: {
      preload: path.join(__dirname, 'launcherPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

export function updateSplashStatus(status: string) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status', status);
  }
}

export function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

export function getDatabasePaths() {
  const isDev = !app.isPackaged;
  let dbDir: string;
  if (isDev) {
    dbDir = path.resolve(__dirname, '../../app/data');
  } else {
    dbDir = path.join(app.getPath('userData'), 'data');
  }
  const dbPath = path.join(dbDir, 'database.sqlite');
  return { dbDir, dbPath };
}

export function checkDatabase(): { ok: boolean; error?: string } {
  const { dbDir, dbPath } = getDatabasePaths();
  
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Probar escritura simple creando un lockfile o validando acceso de lectura/escritura
    fs.accessSync(dbDir, fs.constants.R_OK | fs.constants.W_OK);
    
    if (fs.existsSync(dbPath)) {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    }
    
    return { ok: true };
  } catch (err: any) {
    console.error('Error de verificación de base de datos:', err);
    return { ok: false, error: `No se pudo acceder a la carpeta de base de datos: ${dbDir}\nDetalle: ${err.message}` };
  }
}

export async function waitForBackend(
  port: number = 5000,
  retries: number = 8,
  host: string = '127.0.0.1'
): Promise<boolean> {
  const url = `http://${host}:${port}/health`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, { timeout: 600 });
      if (res.status === 200 && res.data.status === 'ok') {
        return true;
      }
    } catch (e) {
      // Ignorar fallo y reintentar
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return false;
}

export function showErrorDiagnostics(errorMessage: string, onRetry: () => void) {
  closeSplash();

  if (errorWindow && !errorWindow.isDestroyed()) {
    errorWindow.focus();
    return;
  }

  errorWindow = new BrowserWindow({
    width: 500,
    height: 380,
    frame: false,
    resizable: false,
    icon: resolveWindowIconPath(),
    backgroundColor: '#0D0F14',
    webPreferences: {
      preload: path.join(__dirname, 'launcherPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  errorWindow.loadFile(path.join(__dirname, 'error.html'));

  errorWindow.webContents.on('did-finish-load', () => {
    errorWindow?.webContents.send('error-details', errorMessage);
  });

  // Escuchar acciones de la ventana de error
  const ipcHandler = (event: any, action: string) => {
    if (!errorWindow || event.sender !== errorWindow.webContents) return;

    if (action === 'retry') {
      cleanup();
      onRetry();
    } else if (action === 'open-logs') {
      // El directorio de logs está en <root>/logs o similar, abrir carpeta de datos del usuario
      const logDir = path.resolve(__dirname, '../../logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      shell.openPath(logDir);
    } else if (action === 'exit') {
      cleanup();
      app.quit();
    }
  };

  const cleanup = () => {
    ipcMain.off('error-window-action', ipcHandler);
    if (errorWindow && !errorWindow.isDestroyed()) {
      errorWindow.close();
    }
  };

  ipcMain.on('error-window-action', ipcHandler);

  errorWindow.on('closed', () => {
    ipcMain.off('error-window-action', ipcHandler);
    errorWindow = null;
  });
}
