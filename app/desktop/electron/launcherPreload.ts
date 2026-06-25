import { contextBridge, ipcRenderer } from 'electron';

type ErrorWindowAction = 'retry' | 'open-logs' | 'exit';

function subscribe(channel: string, callback: (message: string) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, message: unknown) => {
    callback(typeof message === 'string' ? message : '');
  };

  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

contextBridge.exposeInMainWorld('mapleLauncher', {
  onStatus: (callback: (message: string) => void) => subscribe('status', callback),
  onErrorDetails: (callback: (message: string) => void) => subscribe('error-details', callback),
  sendErrorAction: (action: ErrorWindowAction) => {
    if (action === 'retry' || action === 'open-logs' || action === 'exit') {
      ipcRenderer.send('error-window-action', action);
    }
  }
});
