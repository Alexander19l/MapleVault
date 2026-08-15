import fs from 'fs';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import {
  ensureLibreTranslateRunning,
  getLibreTranslateInstallDataDir,
  getLibreTranslateRuntimeStatus
} from './translationRuntime';
import { getTranslationSettings } from './translationService';
import { createSanitizedChildProcessEnv } from './childProcessEnv';

export type TranslationInstallState =
  | 'idle'
  | 'installing'
  | 'verifying'
  | 'success'
  | 'error'
  | 'unsupported';

export interface TranslationInstallStatus {
  state: TranslationInstallState;
  pid?: number;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  output?: string;
}

interface InstallerDependencies {
  platform?: NodeJS.Platform;
  spawnProcess?: typeof spawn;
  fileExists?: typeof fs.existsSync;
  getScriptPath?: () => string | null;
  getDataDir?: () => string;
  getRuntimeStatus?: typeof getLibreTranslateRuntimeStatus;
  ensureRuntime?: typeof ensureLibreTranslateRunning;
}

function appendOutput(current: string, chunk: unknown): string {
  const normalized = `${current}${String(chunk || '')}`.replace(/\u001b\[[0-9;]*m/g, '');
  return normalized.length > 6000 ? normalized.slice(-6000) : normalized;
}

function getInstallationFailureMessage(code: number | null, output: string): string {
  if (/ctranslate2|visual c\+\+/i.test(output)) {
    return [
      'No se pudo preparar la dependencia nativa de LibreTranslate.',
      'Revisa el diagnostico de Microsoft Visual C++ Runtime y reinicia Windows si fue solicitado.'
    ].join(' ');
  }

  return `La instalacion de LibreTranslate termino con codigo ${code ?? 'desconocido'}.`;
}

function findSetupScript(fileExists: typeof fs.existsSync): string | null {
  const configuredPath = process.env.MAPLEVAULT_LIBRETRANSLATE_SETUP_SCRIPT?.trim();
  const candidates = [
    configuredPath ? path.resolve(configuredPath) : '',
    path.resolve(__dirname, '../../scripts/setup-libretranslate.ps1'),
    path.resolve(__dirname, '../../../../scripts/setup-libretranslate.ps1')
  ].filter(Boolean);

  return candidates.find(candidate => fileExists(candidate)) || null;
}

function getPowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot) {
    return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  }
  return 'powershell.exe';
}

export class LibreTranslateInstaller {
  private readonly platform: NodeJS.Platform;
  private readonly spawnProcess: typeof spawn;
  private readonly fileExists: typeof fs.existsSync;
  private readonly getScriptPath: () => string | null;
  private readonly getDataDir: () => string;
  private readonly getRuntimeStatus: typeof getLibreTranslateRuntimeStatus;
  private readonly ensureRuntime: typeof ensureLibreTranslateRunning;
  private process: ChildProcess | null = null;
  private status: TranslationInstallStatus = { state: 'idle' };

  constructor(dependencies: InstallerDependencies = {}) {
    this.platform = dependencies.platform || process.platform;
    this.spawnProcess = dependencies.spawnProcess || spawn;
    this.fileExists = dependencies.fileExists || fs.existsSync;
    this.getScriptPath = dependencies.getScriptPath || (() => findSetupScript(this.fileExists));
    this.getDataDir = dependencies.getDataDir || getLibreTranslateInstallDataDir;
    this.getRuntimeStatus = dependencies.getRuntimeStatus || getLibreTranslateRuntimeStatus;
    this.ensureRuntime = dependencies.ensureRuntime || ensureLibreTranslateRunning;
  }

  getStatus(): TranslationInstallStatus {
    return { ...this.status };
  }

  async start(): Promise<TranslationInstallStatus> {
    if (this.process && !this.process.killed) {
      return this.getStatus();
    }

    if (this.platform !== 'win32') {
      this.status = {
        state: 'unsupported',
        message: 'La instalacion automatica de LibreTranslate esta disponible actualmente en Windows.'
      };
      return this.getStatus();
    }

    const runtimeStatus = await this.getRuntimeStatus();
    if (runtimeStatus.state === 'running' || runtimeStatus.state === 'already_running') {
      this.status = {
        state: 'success',
        finishedAt: new Date().toISOString(),
        message: 'LibreTranslate ya esta instalado y responde correctamente.'
      };
      return this.getStatus();
    }

    const scriptPath = this.getScriptPath();
    if (!scriptPath) {
      this.status = {
        state: 'error',
        finishedAt: new Date().toISOString(),
        message: 'No se encontro el instalador incluido de LibreTranslate.'
      };
      return this.getStatus();
    }

    const startedAt = new Date().toISOString();
    let output = '';
    let finished = false;
    const child = this.spawnProcess(
      getPowerShellExecutable(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-DataDir', this.getDataDir(),
        '-NonInteractive'
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: createSanitizedChildProcessEnv({ PYTHONUTF8: '1' })
      }
    );

    this.process = child;
    this.status = {
      state: 'installing',
      pid: child.pid,
      startedAt,
      message: 'Instalando LibreTranslate y el modelo de traduccion ingles-espanol.'
    };

    child.stdout?.on('data', chunk => {
      output = appendOutput(output, chunk);
      this.status = { ...this.status, output };
    });
    child.stderr?.on('data', chunk => {
      output = appendOutput(output, chunk);
      this.status = { ...this.status, output };
    });

    child.once('error', error => {
      if (finished) return;
      finished = true;
      this.process = null;
      this.status = {
        state: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        message: `No se pudo iniciar el instalador de LibreTranslate: ${error.message}`,
        output
      };
    });

    child.once('exit', code => {
      if (finished) return;
      finished = true;
      this.process = null;
      void this.finishInstallation(code, startedAt, output);
    });

    return this.getStatus();
  }

  private async finishInstallation(code: number | null, startedAt: string, output: string): Promise<void> {
    if (code !== 0) {
      this.status = {
        state: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        message: getInstallationFailureMessage(code, output),
        output
      };
      return;
    }

    this.status = {
      state: 'verifying',
      startedAt,
      message: 'Instalacion terminada. Verificando el servicio local.',
      output
    };

    const settings = getTranslationSettings();
    const runtimeStatus = await this.ensureRuntime({
      ...settings,
      enabled: true,
      autoStart: true
    });
    const isHealthy = runtimeStatus.state === 'running' || runtimeStatus.state === 'already_running';

    this.status = {
      state: isHealthy ? 'success' : 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      message: isHealthy
        ? 'LibreTranslate se instalo y responde correctamente.'
        : `LibreTranslate se instalo, pero no supero la verificacion: ${runtimeStatus.lastError || runtimeStatus.state}.`,
      output
    };
  }
}

const installer = new LibreTranslateInstaller();

export function startLibreTranslateInstallation(): Promise<TranslationInstallStatus> {
  return installer.start();
}

export function getLibreTranslateInstallationStatus(): TranslationInstallStatus {
  return installer.getStatus();
}
