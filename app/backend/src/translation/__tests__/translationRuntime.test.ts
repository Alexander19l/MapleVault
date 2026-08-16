import { EventEmitter } from 'events';
import fs from 'fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { spawn, spawnSync } from 'child_process';
import {
  ensureLibreTranslateRunning,
  resetLibreTranslateRuntimeForTests,
  type TranslationRuntimeStatus
} from '../translationRuntime';
import type { TranslationSettings } from '../translationService';

vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn()
}));

const settings: TranslationSettings = {
  enabled: true,
  autoStart: true,
  provider: 'libretranslate',
  url: 'http://localhost:5001',
  apiKey: '',
  targetLanguage: 'es',
  timeoutMs: 1000,
  cacheEnabled: false,
  translateSynopsis: true,
  translateGenres: true,
  translateStatuses: true
};

const realExistsSync = fs.existsSync.bind(fs);

function mockWhere(command: string, result: { status: number; stdout?: string }) {
  vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
    const requested = Array.isArray(args) ? args[0] : '';
    if (String(cmd).includes('where') && requested === command) {
      return { status: result.status, stdout: result.stdout || '', stderr: '' } as any;
    }
    return { status: 1, stdout: '', stderr: '' } as any;
  });
}

describe('translationRuntime', () => {
  beforeEach(() => {
    resetLibreTranslateRuntimeForTests();
    vi.clearAllMocks();
    vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
      if (String(target).toLowerCase().includes('libretranslate')) {
        return false;
      }
      return realExistsSync(target);
    });
    delete process.env.LIBRETRANSLATE_AUTOSTART_COMMAND;
    process.env.MAPLEVAULT_API_TOKEN = 'backend-session-secret';
    process.env.MAPLEVAULT_CREDENTIAL_KEY = 'credential-secret';
  });

  afterEach(() => {
    resetLibreTranslateRuntimeForTests();
    delete process.env.LIBRETRANSLATE_AUTOSTART_COMMAND;
    delete process.env.MAPLEVAULT_API_TOKEN;
    delete process.env.MAPLEVAULT_CREDENTIAL_KEY;
    vi.restoreAllMocks();
  });

  it('no inicia procesos si LibreTranslate ya esta respondiendo', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: [{ code: 'en', targets: ['en', 'es'] }]
    });

    const status = await ensureLibreTranslateRunning(settings);

    expect(status.state).toBe('already_running');
    expect(axios.get).toHaveBeenCalledWith('http://127.0.0.1:5001/languages', expect.any(Object));
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reporta dependencias faltantes cuando no existe el ejecutable local', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as any);

    const status = await ensureLibreTranslateRunning(settings);

    expect(status.state).toBe('unavailable');
    expect(status.installHint).toContain('Preparar LibreTranslate');
    expect(status.attempts?.join('\n')).toContain('libretranslate');
    expect(status.attempts?.join('\n')).toContain('.venv');
    expect(status.attempts?.join('\n')).toContain('libretranslate no esta en PATH');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reporta unavailable si el servicio responde pero no tiene modelo hacia espanol', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      status: 200,
      data: [{ code: 'en', targets: ['en'] }]
    });

    const status = await ensureLibreTranslateRunning(settings);

    expect(status.state).toBe('unavailable');
    expect(status.lastError).toContain('modelo hacia "es"');
    expect(status.installHint).toContain('translate-en_es');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('marca running cuando logra iniciar un comando valido y el health check responde', async () => {
    process.env.LIBRETRANSLATE_AUTOSTART_COMMAND = 'fake-libretranslate --host 127.0.0.1 --port 5001';
    vi.mocked(axios.get)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({
        status: 200,
        data: [{ code: 'en', targets: ['en', 'es'] }]
      });
    mockWhere('fake-libretranslate', { status: 0, stdout: 'C:\\tools\\fake-libretranslate.cmd\r\n' });

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 1234;
    child.killed = false;
    child.kill = vi.fn();
    vi.mocked(spawn).mockImplementation(() => {
      process.nextTick(() => child.emit('spawn'));
      return child;
    });

    const status: TranslationRuntimeStatus = await ensureLibreTranslateRunning(settings);

    expect(status.state).toBe('running');
    expect(status.command).toBe('fake-libretranslate --host 127.0.0.1 --port 5001');
    expect(status.pid).toBe(1234);
    expect(spawn).toHaveBeenCalledWith(
      'fake-libretranslate',
      ['--host', '127.0.0.1', '--port', '5001'],
      expect.objectContaining({ windowsHide: true })
    );
    const spawnOptions = vi.mocked(spawn).mock.calls[0][2] as { env?: NodeJS.ProcessEnv };
    expect(spawnOptions.env?.PYTHONUTF8).toBe('1');
    expect(spawnOptions.env?.MAPLEVAULT_API_TOKEN).toBeUndefined();
    expect(spawnOptions.env?.MAPLEVAULT_CREDENTIAL_KEY).toBeUndefined();
  });
});
