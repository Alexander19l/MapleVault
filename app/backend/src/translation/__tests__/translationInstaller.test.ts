import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { LibreTranslateInstaller } from '../translationInstaller';

function createChildProcess() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4120;
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
  });
  return child;
}

describe('LibreTranslateInstaller', () => {
  it('no reinstala cuando el servicio ya responde correctamente', async () => {
    const spawnProcess = vi.fn();
    const installer = new LibreTranslateInstaller({
      platform: 'win32',
      spawnProcess: spawnProcess as any,
      getRuntimeStatus: vi.fn().mockResolvedValue({
        state: 'already_running',
        url: 'http://localhost:5001'
      })
    });

    const status = await installer.start();

    expect(status.state).toBe('success');
    expect(status.message).toContain('ya esta instalado');
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('ejecuta solamente el script incluido y verifica el servicio al terminar', async () => {
    const child = createChildProcess();
    const spawnProcess = vi.fn(() => child);
    const ensureRuntime = vi.fn().mockResolvedValue({
      state: 'running',
      url: 'http://localhost:5001'
    });
    const installer = new LibreTranslateInstaller({
      platform: 'win32',
      spawnProcess: spawnProcess as any,
      getScriptPath: () => 'C:\\MapleVault\\setup-libretranslate.ps1',
      getDataDir: () => 'C:\\Users\\test\\AppData\\Local\\MapleVault',
      getRuntimeStatus: vi.fn().mockResolvedValue({
        state: 'unavailable',
        url: 'http://localhost:5001'
      }),
      ensureRuntime
    });

    const started = await installer.start();
    const duplicateStart = await installer.start();

    expect(started.state).toBe('installing');
    expect(duplicateStart.state).toBe('installing');
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(spawnProcess).toHaveBeenCalledWith(
      expect.stringContaining('powershell.exe'),
      expect.arrayContaining([
        '-File',
        'C:\\MapleVault\\setup-libretranslate.ps1',
        '-DataDir',
        'C:\\Users\\test\\AppData\\Local\\MapleVault'
      ]),
      expect.objectContaining({ windowsHide: true })
    );

    child.stdout.emit('data', '[LibreTranslate] Instalando modelo...');
    child.emit('exit', 0);

    await vi.waitFor(() => {
      expect(installer.getStatus().state).toBe('success');
    });
    expect(installer.getStatus().output).toContain('Instalando modelo');
    expect(ensureRuntime).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      autoStart: true
    }));
  });

  it('conserva la salida de diagnostico cuando el instalador falla', async () => {
    const child = createChildProcess();
    const installer = new LibreTranslateInstaller({
      platform: 'win32',
      spawnProcess: vi.fn(() => child) as any,
      getScriptPath: () => 'C:\\MapleVault\\setup-libretranslate.ps1',
      getRuntimeStatus: vi.fn().mockResolvedValue({
        state: 'unavailable',
        url: 'http://localhost:5001'
      })
    });

    await installer.start();
    child.stderr.emit('data', 'No se pudo descargar el modelo');
    child.emit('exit', 1);

    expect(installer.getStatus()).toEqual(expect.objectContaining({
      state: 'error',
      output: expect.stringContaining('No se pudo descargar el modelo')
    }));
  });

  it('informa que la instalacion automatica no esta disponible fuera de Windows', async () => {
    const installer = new LibreTranslateInstaller({
      platform: 'linux',
      getRuntimeStatus: vi.fn() as any
    });

    const status = await installer.start();

    expect(status.state).toBe('unsupported');
  });
});

