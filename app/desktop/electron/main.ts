import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, type MessageBoxOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { 
  showSplash, 
  updateSplashStatus, 
  closeSplash, 
  checkDatabase, 
  waitForBackend, 
  showErrorDiagnostics,
  getDatabasePaths
} from './launcher';
import { initPlayerProtection, setPlayerProtectionMainWindow } from './adblock/playerProtection';
import { resolveDesktopAssetPath, resolveWindowIconPath } from './desktopAssets';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isClosePromptOpen = false;
let cachedCloseBehavior: CloseBehavior | null = null;

const isDev = !app.isPackaged;
const parsedBackendPort = Number.parseInt(process.env.MAPLEVAULT_BACKEND_PORT || '5000', 10);
const PORT = Number.isInteger(parsedBackendPort) && parsedBackendPort > 0 && parsedBackendPort <= 65_535
  ? parsedBackendPort
  : 5000;
const BACKEND_HOST = process.env.MAPLEVAULT_BACKEND_HOST || '127.0.0.1';
const RENDERER_URL = process.env.MAPLEVAULT_RENDERER_URL || 'http://127.0.0.1:5173';
const BACKEND_STARTUP_RETRIES = 40;
const BACKEND_SESSION_TOKEN = isDev
  ? process.env.MAPLEVAULT_API_TOKEN || ''
  : crypto.randomBytes(32).toString('hex');

type CloseBehavior = 'ask' | 'minimize' | 'quit';

interface StartupSettings {
  supported: boolean;
  enabled: boolean;
  reason?: string;
}

function normalizeCloseBehavior(value: unknown): CloseBehavior {
  return value === 'minimize' || value === 'quit' || value === 'ask' ? value : 'ask';
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
}

function getCloseBehavior(): CloseBehavior {
  if (cachedCloseBehavior) return cachedCloseBehavior;

  try {
    const { dbDir } = getDatabasePaths();
    const settingsPath = path.join(dbDir, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      cachedCloseBehavior = 'ask';
      return cachedCloseBehavior;
    }
    cachedCloseBehavior = normalizeCloseBehavior(
      JSON.parse(fs.readFileSync(settingsPath, 'utf8'))?.closeBehavior
    );
    return cachedCloseBehavior;
  } catch (err: any) {
    console.warn('[Main] No se pudo leer la preferencia de cierre:', err.message);
    return 'ask';
  }
}

function setCloseBehavior(value: unknown): CloseBehavior {
  cachedCloseBehavior = normalizeCloseBehavior(value);
  return cachedCloseBehavior;
}

function getStartupSettings(): StartupSettings {
  if (process.platform !== 'win32') {
    return {
      supported: false,
      enabled: false,
      reason: 'El inicio automático está disponible en la versión de Windows.'
    };
  }

  if (!app.isPackaged) {
    return {
      supported: false,
      enabled: false,
      reason: 'El inicio automático se habilita en la aplicación instalada, no en modo desarrollo.'
    };
  }

  const settings = app.getLoginItemSettings({ path: process.execPath });
  return {
    supported: true,
    enabled: settings.openAtLogin
  };
}

function setStartupSettings(enabled: boolean): StartupSettings {
  const current = getStartupSettings();
  if (!current.supported) return current;

  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath
  });

  return getStartupSettings();
}

function startBackendProcess() {
  if (!isDev) {
    console.log('Arrancando el servidor backend en producción...');
    const backendPath = path.resolve(__dirname, '../backend-runtime/dist/server.js').replace('app.asar', 'app.asar.unpacked');
    const { dbPath } = getDatabasePaths();
    
    backendProcess = spawn(process.execPath, [backendPath], {
      env: { 
        ...process.env, 
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(PORT),
        MAPLEVAULT_HOST: BACKEND_HOST,
        MAPLEVAULT_API_TOKEN: BACKEND_SESSION_TOKEN,
        DATABASE_PATH: dbPath
      },
      stdio: 'inherit',
      windowsHide: true
    });

    backendProcess.on('error', (err) => {
      console.error('Error al arrancar el proceso del backend:', err);
    });

    backendProcess.on('close', (code) => {
      console.log(`El proceso del backend finalizó con código: ${code}`);
    });
  } else {
    console.log('Modo desarrollo detectado. El backend se ejecuta de forma externa.');
  }
}

function resolveTrayIconPath(): string {
  return resolveDesktopAssetPath('icon.png');
}

function restoreMainWindow() {
  if (!mainWindow) {
    bootAppWorkflow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) return;

  const image = nativeImage.createFromPath(resolveTrayIconPath());
  const trayImage = image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 });
  tray = new Tray(trayImage);
  tray.setToolTip('MapleVault se está ejecutando en segundo plano');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Abrir MapleVault',
      click: restoreMainWindow
    },
    {
      label: 'Cerrar por completo',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', restoreMainWindow);
  tray.on('double-click', restoreMainWindow);
}

function sendMainWindowToBackground() {
  if (!mainWindow) return;
  ensureTray();
  mainWindow.hide();
}

async function bootAppWorkflow() {
  showSplash();
  
  updateSplashStatus('Verificando base de datos...');
  const dbCheck = checkDatabase();
  if (!dbCheck.ok) {
    showErrorDiagnostics(
      dbCheck.error || 'No se pudo acceder o inicializar la base de datos local SQLite.',
      bootAppWorkflow
    );
    return;
  }

  updateSplashStatus('Iniciando servicios locales...');
  startBackendProcess();

  updateSplashStatus('Conectando con biblioteca...');
  const isHealthy = await waitForBackend(PORT, BACKEND_STARTUP_RETRIES, BACKEND_HOST);
  if (!isHealthy) {
    showErrorDiagnostics(
      `El backend interno no respondió en el puerto ${PORT} después de múltiples intentos.\nPor favor, verifica los logs e intenta de nuevo.`,
      bootAppWorkflow
    );
    killBackend();
    return;
  }

  updateSplashStatus('Cargando interfaz...');
  createMainWindow();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: 'MapleVault',
    icon: resolveWindowIconPath(),
    backgroundColor: '#0D0F14',
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  setPlayerProtectionMainWindow(mainWindow);

  // Reenviar logs del renderer solo durante desarrollo.
  if (isDev) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[Renderer Console] [Level ${level}] ${message} (en ${sourceId}:${line})`);
    });
  }

  if (!isDev) {
    mainWindow.setMenu(null);
  }

  // Cargar frontend
  if (isDev) {
    mainWindow.loadURL(RENDERER_URL);
    if (process.env.OPEN_DEVTOOLS === 'true') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../app/frontend/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow?.show();
  });

  mainWindow.on('close', async (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (!mainWindow || isClosePromptOpen) return;

    const closeBehavior = getCloseBehavior();
    if (closeBehavior === 'minimize') {
      sendMainWindowToBackground();
      return;
    }

    if (closeBehavior === 'quit') {
      isQuitting = true;
      app.quit();
      return;
    }

    isClosePromptOpen = true;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Minimizar en segundo plano', 'Cerrar por completo', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      title: 'Cerrar MapleVault',
      message: '¿Qué quieres hacer con MapleVault?',
      detail: 'Minimizar en segundo plano oculta la ventana y mantiene los servicios locales activos. Puedes volver desde el icono de la bandeja del sistema. Cerrar por completo detiene MapleVault.'
    });
    isClosePromptOpen = false;

    if (result.response === 0) {
      sendMainWindowToBackground();
      return;
    }

    if (result.response === 1) {
      isQuitting = true;
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    setPlayerProtectionMainWindow(null);
    mainWindow = null;
  });
}

function killBackend() {
  if (backendProcess) {
    console.log('Deteniendo el servidor backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('app-get-api-config', () => ({
    baseUrl: `http://localhost:${PORT}`,
    token: BACKEND_SESSION_TOKEN
  }));

  // Inicializar el sistema completo de protección del reproductor
  // Esto activa: Ghostery, interceptores de red, protección CSS/JS, logging
  try {
    // mainWindow no existe aún, se creará después de bootAppWorkflow
    // Creamos un placeholder temporal y lo actualizaremos
    await initPlayerProtection(null);
  } catch (err) {
    console.error('[Main] Error inicializando protección del reproductor:', err);
  }

  bootAppWorkflow();

  // Registrar listeners de IPC para control de ventana personalizada
  ipcMain.on('window-minimize', () => { mainWindow?.minimize(); });
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize(); } else { mainWindow?.maximize(); }
  });
  ipcMain.on('window-close', () => { mainWindow?.close(); });
  ipcMain.handle('window-is-maximized', () => { return mainWindow?.isMaximized() || false; });
  ipcMain.handle('app-get-startup-settings', () => getStartupSettings());
  ipcMain.handle('app-set-startup-settings', (_event, enabled: boolean) => setStartupSettings(Boolean(enabled)));
  ipcMain.handle('app-get-close-behavior', () => getCloseBehavior());
  ipcMain.handle('app-set-close-behavior', (_event, value: unknown) => setCloseBehavior(value));

  ipcMain.handle('show-confirm', async (_event, message: string) => {
    const options: MessageBoxOptions = {
      type: 'question',
      buttons: ['Cancelar', 'Confirmar'],
      defaultId: 1,
      cancelId: 0,
      title: 'Confirmar acción',
      message: String(message || '¿Confirmas esta acción?')
    };
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });

  // Canales IPC para operaciones de shell
  ipcMain.on('shell-open-external', (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (_) {
      console.warn('[Main] URL externa inválida ignorada');
    }
  });

  ipcMain.on('shell-open-path', (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath.length > 0 && path.isAbsolute(filePath)) {
      shell.openPath(filePath).catch(err => {
        console.warn('[Main] No se pudo abrir la ruta:', err.message);
      });
    }
  });

  ipcMain.on('shell-show-item', (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath.length > 0 && path.isAbsolute(filePath)) {
      shell.showItemInFolder(filePath);
    }
  });

  app.on('activate', restoreMainWindow);
});

app.on('second-instance', restoreMainWindow);

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  tray?.destroy();
  tray = null;
  killBackend();
});
