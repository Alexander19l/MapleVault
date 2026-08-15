import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    delete process.env.MAPLEVAULT_API_TOKEN;
    delete process.env.MAPLEVAULT_CREDENTIAL_KEY;
  });

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
    process.env.MAPLEVAULT_API_TOKEN = 'backend-session-secret';
    process.env.MAPLEVAULT_CREDENTIAL_KEY = 'credential-secret';
    const child = createChildProcess();
    const spawnProcess = vi.fn((..._args: any[]) => child);
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
    const spawnOptions = spawnProcess.mock.calls[0][2] as { env?: NodeJS.ProcessEnv };
    expect(spawnOptions.env?.PYTHONUTF8).toBe('1');
    expect(spawnOptions.env?.MAPLEVAULT_API_TOKEN).toBeUndefined();
    expect(spawnOptions.env?.MAPLEVAULT_CREDENTIAL_KEY).toBeUndefined();

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
    child.stderr.emit('data', 'CTranslate2 no pudo cargar Microsoft Visual C++ Runtime');
    child.emit('exit', 1);

    expect(installer.getStatus()).toEqual(expect.objectContaining({
      state: 'error',
      message: expect.stringContaining('dependencia nativa'),
      output: expect.stringContaining('Visual C++ Runtime')
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
