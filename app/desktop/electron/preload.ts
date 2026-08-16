/**
 * preload.ts — Puente IPC seguro entre Electron Main y el Renderer (React)
 * 
 * REGLAS DE SEGURIDAD:
 * - contextIsolation: true (configurado en main.ts)
 * - Solo canales IPC explícitamente registrados aquí
 * - No se expone Node.js al frontend
 * - Rutas de archivo validadas antes de pasar a shell
 */
import { contextBridge, ipcRenderer } from 'electron';

// Extensiones de archivo peligrosas — no se pueden abrir desde el frontend
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.psm1', '.psd1',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.msi',
  '.msc', '.reg', '.hta', '.cpl', '.scr', '.inf', '.pif',
  '.lnk', '.com', '.app', '.dmg', '.deb', '.rpm', '.run'
]);

/**
 * Verifica si una extensión de archivo es segura para abrir
 */
function isSafeFileExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lower.endsWith(ext)) return false;
  }
  return true;
}

/**
 * Valida que una URL sea http o https (no file://, javascript:, etc.)
 */
function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Canales IPC permitidos de renderer → main (fire-and-forget)
const ALLOWED_SEND_CHANNELS = new Set([
  'window-minimize',
  'window-maximize',
  'window-close'
]);

// Canales IPC permitidos de renderer → main (invoke/await)
const ALLOWED_INVOKE_CHANNELS = new Set([
  'window-is-maximized',
  'adblock-get-stats',
  'adblock-get-log',
  'adblock-toggle',
  'adblock-reset-stats',
  'show-confirm',
  'app-get-api-config',
  'app-get-startup-settings',
  'app-set-startup-settings',
  'app-get-close-behavior',
  'app-set-close-behavior',
  'manga-save-archive',
  'player-open'
]);

contextBridge.exposeInMainWorld('electronAPI', {
  // === Control de ventana ===
  minimize: () => {
    ipcRenderer.send('window-minimize');
  },
  maximize: () => {
    ipcRenderer.send('window-maximize');
  },
  close: () => {
    ipcRenderer.send('window-close');
  },
  isMaximized: (): Promise<boolean> => {
    return ipcRenderer.invoke('window-is-maximized');
  },
  
  // === Cuadro de Diálogo Nativo ===
  confirm: (msg: string): Promise<boolean> => {
    return ipcRenderer.invoke('show-confirm', msg);
  },

  startup: {
    get: (): Promise<{ supported: boolean; enabled: boolean; reason?: string }> => {
      return ipcRenderer.invoke('app-get-startup-settings');
    },
    set: (enabled: boolean): Promise<{ supported: boolean; enabled: boolean; reason?: string }> => {
      return ipcRenderer.invoke('app-set-startup-settings', Boolean(enabled));
    }
  },

  closeBehavior: {
    get: (): Promise<'ask' | 'minimize' | 'quit'> => {
      return ipcRenderer.invoke('app-get-close-behavior');
    },
    set: (value: 'ask' | 'minimize' | 'quit'): Promise<'ask' | 'minimize' | 'quit'> => {
      return ipcRenderer.invoke('app-set-close-behavior', value);
    }
  },

  manga: {
    saveArchive: (request: { series: string; fileName: string; data: Uint8Array }): Promise<{ saved: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke('manga-save-archive', request);
    }
  },

  backend: {
    getConfig: (): Promise<{ baseUrl: string; token: string }> => {
      return ipcRenderer.invoke('app-get-api-config');
    }
  },

  player: {
    open: (request: {
      url: string;
      title?: string;
      server?: string;
      referer?: string;
      mode?: 'embedded' | 'direct';
    }): Promise<{
      opened: boolean;
      error?: string;
    }> => {
      return ipcRenderer.invoke('player-open', request);
    }
  },

  // === Apertura de URLs externas (solo http/https) ===
  openExternal: (url: string): void => {
    if (typeof url !== 'string') return;
    if (isSafeExternalUrl(url)) {
      // Usar IPC para pasar la URL al main process que la abre con shell.openExternal
      // No importar shell directamente en el preload — usar IPC
      ipcRenderer.send('shell-open-external', url);
    } else {
      console.warn('[Preload] URL externa rechazada (protocolo no permitido):', url.slice(0, 100));
    }
  },

  // === Apertura de archivos locales (con validación de extensión) ===
  openPath: (pathStr: string): void => {
    if (typeof pathStr !== 'string' || pathStr.trim().length === 0) return;
    if (isSafeFileExtension(pathStr)) {
      ipcRenderer.send('shell-open-path', pathStr);
    } else {
      console.warn('[Preload] Apertura de archivo rechazada (extensión peligrosa):', pathStr.slice(0, 100));
    }
  },

  // === Mostrar archivo en explorador de carpetas ===
  showItemInFolder: (pathStr: string): void => {
    if (typeof pathStr !== 'string' || pathStr.trim().length === 0) return;
    if (isSafeFileExtension(pathStr)) {
      ipcRenderer.send('shell-show-item', pathStr);
    } else {
      console.warn('[Preload] showItemInFolder rechazado (extensión peligrosa):', pathStr.slice(0, 100));
    }
  },

  // === API genérica IPC (solo canales permitidos) ===
  send: (channel: string, ...args: any[]): void => {
    if (ALLOWED_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn('[Preload] Canal IPC no permitido:', channel);
    }
  },

  invoke: (channel: string, ...args: any[]): Promise<any> => {
    if (ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    console.warn('[Preload] Canal IPC invoke no permitido:', channel);
    return Promise.reject(new Error(`Canal '${channel}' no permitido.`));
  },

  // === AdBlock API ===
  adblock: {
    getStats: (): Promise<any> => ipcRenderer.invoke('adblock-get-stats'),
    getLog: (): Promise<any> => ipcRenderer.invoke('adblock-get-log'),
    toggle: (enabled: boolean): Promise<any> => ipcRenderer.invoke('adblock-toggle', enabled),
    resetStats: (): Promise<any> => ipcRenderer.invoke('adblock-reset-stats'),
  }
});
