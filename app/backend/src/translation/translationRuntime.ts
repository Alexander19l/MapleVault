import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import { DB_PATH } from '../database/db';
import { createSanitizedChildProcessEnv } from './childProcessEnv';
import { getLibreTranslateApiBaseUrl, getTranslationSettings, type TranslationSettings } from './translationService';

type RuntimeState = 'disabled' | 'already_running' | 'starting' | 'running' | 'unavailable' | 'error';

interface StartCandidate {
  command: string;
  args: string[];
  label: string;
  allowMissing?: boolean;
}

interface LibreTranslateHealth {
  reachable: boolean;
  usable: boolean;
  lastError?: string;
}

export interface TranslationRuntimeStatus {
  state: RuntimeState;
  url: string;
  command?: string;
  pid?: number;
  lastError?: string;
  attempts?: string[];
  installHint?: string;
}

let libreTranslateProcess: ChildProcess | null = null;
let currentStatus: TranslationRuntimeStatus = {
  state: 'disabled',
  url: getTranslationSettings().url
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getInstallHint(): string {
  return [
    'LibreTranslate no esta instalado, no esta disponible o no tiene el modelo hacia espanol.',
    'Puedes instalar el componente opcional y el modelo translate-en_es desde Ajustes > Traduccion de metadata.',
    'En desarrollo tambien puedes usar "Preparar LibreTranslate" desde MapleVault.bat.',
    'Tambien puedes definir LIBRETRANSLATE_AUTOSTART_COMMAND con un comando propio.'
  ].join(' ');
}

export function getLibreTranslateInstallDataDir(): string {
  const configuredDirectory = process.env.MAPLEVAULT_LIBRETRANSLATE_DATA_DIR?.trim();
  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'MapleVault');
  }

  return path.dirname(DB_PATH);
}

export function getLocalLibreTranslateExecutables(): string[] {
  const executable = process.platform === 'win32' ? 'libretranslate.exe' : 'libretranslate';
  const venvBin = process.platform === 'win32' ? 'Scripts' : 'bin';
  const runtimeDirectories = [
    path.join(getLibreTranslateInstallDataDir(), 'libretranslate'),
    path.join(path.dirname(DB_PATH), 'libretranslate')
  ];

  return [...new Set(runtimeDirectories.map(runtimeDirectory => (
    path.join(runtimeDirectory, '.venv', venvBin, executable)
  )))];
}

function parseHostAndPort(settings: TranslationSettings): { host: string; port: string } {
  try {
    const parsed = new URL(settings.url);
    const hostname = parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname;
    return {
      host: hostname || '127.0.0.1',
      port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    };
  } catch (_) {
    return { host: '127.0.0.1', port: '5001' };
  }
}

function getLanguagesFromResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.languages)) return data.languages;
  return [];
}

function supportsTargetLanguage(languages: any[], settings: TranslationSettings): boolean {
  return languages.some(language => (
    Array.isArray(language?.targets) &&
    language.targets.includes(settings.targetLanguage)
  ));
}

async function checkLibreTranslateHealth(settings: TranslationSettings): Promise<LibreTranslateHealth> {
  try {
    const res = await axios.get(`${getLibreTranslateApiBaseUrl(settings.url)}/languages`, { timeout: 700 });
    const reachable = res.status >= 200 && res.status < 300;
    if (!reachable) {
      return { reachable: false, usable: false, lastError: `LibreTranslate respondio con estado ${res.status}` };
    }

    const languages = getLanguagesFromResponse(res.data);
    if (!supportsTargetLanguage(languages, settings)) {
      return {
        reachable: true,
        usable: false,
        lastError: `LibreTranslate esta activo, pero no tiene instalado un modelo hacia "${settings.targetLanguage}"`
      };
    }

    return { reachable: true, usable: true };
  } catch (err: any) {
    return { reachable: false, usable: false, lastError: err.message };
  }
}

function splitCommand(rawCommand: string): string[] {
  return rawCommand.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, '')) || [];
}

function buildStartCandidates(settings: TranslationSettings): StartCandidate[] {
  const { host, port } = parseHostAndPort(settings);
  const commonArgs = ['--host', host, '--port', port];
  const envCommand = process.env.LIBRETRANSLATE_AUTOSTART_COMMAND;
  const candidates: StartCandidate[] = getLocalLibreTranslateExecutables().map(localExecutable => ({
      command: localExecutable,
      args: commonArgs,
      label: `${localExecutable} ${commonArgs.join(' ')}`,
      allowMissing: true
    }));

  candidates.push(
    { command: 'libretranslate', args: commonArgs, label: `libretranslate ${commonArgs.join(' ')}` }
  );

  if (!envCommand) return candidates;

  const parts = splitCommand(envCommand);
  if (parts.length === 0) return candidates;

  return [
    { command: parts[0], args: parts.slice(1), label: envCommand },
    ...candidates
  ];
}

function findCommand(command: string): { ok: boolean; paths: string[]; reason?: string } {
  if (path.isAbsolute(command)) {
    if (!fs.existsSync(command)) {
      return { ok: false, paths: [], reason: `no existe ${command}` };
    }
    return { ok: true, paths: [command] };
  }

  const lookup = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { encoding: 'utf8' })
    : spawnSync('sh', ['-lc', `command -v ${JSON.stringify(command)}`], { encoding: 'utf8' });

  if (lookup.status !== 0) {
    return { ok: false, paths: [], reason: `${command} no esta en PATH` };
  }

  const paths = String(lookup.stdout || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (command.toLowerCase() === 'python') {
    const usablePaths = paths.filter(candidate => !candidate.toLowerCase().includes('\\microsoft\\windowsapps\\python.exe'));
    if (usablePaths.length === 0) {
      return {
        ok: false,
        paths,
        reason: 'python apunta al alias de Microsoft Store, no a una instalacion real'
      };
    }
    return { ok: true, paths: usablePaths };
  }

  return { ok: paths.length > 0, paths, reason: paths.length > 0 ? undefined : `${command} no esta en PATH` };
}

async function waitForSpawnOrFailure(child: ChildProcess): Promise<{ spawned: boolean; error?: string }> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: { spawned: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.once('spawn', () => settle({ spawned: true }));
    child.once('error', (err) => settle({ spawned: false, error: err.message }));
    setTimeout(() => settle({ spawned: true }), 800);
  });
}

function appendTail(current: string, chunk: unknown): string {
  const next = current + String(chunk || '');
  return next.length > 4000 ? next.slice(-4000) : next;
}

export async function ensureLibreTranslateRunning(settings = getTranslationSettings()): Promise<TranslationRuntimeStatus> {
  currentStatus = {
    ...currentStatus,
    url: settings.url
  };

  if (!settings.enabled || !settings.autoStart) {
    currentStatus = { state: 'disabled', url: settings.url };
    return currentStatus;
  }

  const initialHealth = await checkLibreTranslateHealth(settings);
  if (initialHealth.usable) {
    currentStatus = { state: 'already_running', url: settings.url };
    return currentStatus;
  }

  if (initialHealth.reachable && !initialHealth.usable) {
    currentStatus = {
      state: 'unavailable',
      url: settings.url,
      lastError: initialHealth.lastError,
      installHint: getInstallHint()
    };
    return currentStatus;
  }

  if (libreTranslateProcess && !libreTranslateProcess.killed) {
    currentStatus = {
      state: 'starting',
      url: settings.url,
      command: currentStatus.command,
      pid: libreTranslateProcess.pid,
      attempts: currentStatus.attempts
    };
    return currentStatus;
  }

  const attempts: string[] = [];

  for (const candidate of buildStartCandidates(settings)) {
    const commandCheck = findCommand(candidate.command);
    if (!commandCheck.ok) {
      attempts.push(`${candidate.label}: ${commandCheck.reason || 'comando no disponible'}`);
      continue;
    }

    let exited = false;
    let processOutputTail = '';
    const child = spawn(candidate.command, candidate.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: createSanitizedChildProcessEnv({ PYTHONUTF8: '1' })
    });

    child.stdout?.on('data', chunk => {
      processOutputTail = appendTail(processOutputTail, chunk);
    });
    child.stderr?.on('data', chunk => {
      processOutputTail = appendTail(processOutputTail, chunk);
    });

    const spawnResult = await waitForSpawnOrFailure(child);
    if (!spawnResult.spawned) {
      attempts.push(`${candidate.label}: ${spawnResult.error || 'no se pudo iniciar'}`);
      continue;
    }

    child.once('exit', (code) => {
      exited = true;
      if (libreTranslateProcess === child) {
        libreTranslateProcess = null;
        currentStatus = {
          state: code === 0 ? 'unavailable' : 'error',
          url: settings.url,
          command: candidate.label,
          lastError: `LibreTranslate finalizo con codigo ${code ?? 'desconocido'}${processOutputTail ? `: ${processOutputTail.trim()}` : ''}`,
          attempts,
          installHint: getInstallHint()
        };
      }
    });

    libreTranslateProcess = child;
    currentStatus = {
      state: 'starting',
      url: settings.url,
      command: candidate.label,
      pid: child.pid,
      attempts
    };

    for (let attempt = 0; attempt < 10; attempt++) {
      if (exited) break;
      const health = await checkLibreTranslateHealth(settings);
      if (health.usable) {
        currentStatus = {
          state: 'running',
          url: settings.url,
          command: candidate.label,
          pid: child.pid,
          attempts
        };
        return currentStatus;
      }

      if (health.reachable && !health.usable) {
        try {
          child.kill();
        } catch (_) {}
        currentStatus = {
          state: 'unavailable',
          url: settings.url,
          command: candidate.label,
          pid: child.pid,
          lastError: health.lastError,
          attempts,
          installHint: getInstallHint()
        };
        return currentStatus;
      }
      await delay(500);
    }

    if (!exited) {
      attempts.push(`${candidate.label}: proceso iniciado, esperando disponibilidad en ${settings.url}`);
      return {
        ...currentStatus,
        attempts
      };
    }

    attempts.push(`${candidate.label}: el proceso termino antes de estar listo${processOutputTail ? `: ${processOutputTail.trim()}` : ''}`);
  }

  currentStatus = {
    state: 'unavailable',
    url: settings.url,
    lastError: attempts[attempts.length - 1] || 'No se encontro un ejecutable compatible de LibreTranslate',
    attempts,
    installHint: getInstallHint()
  };
  return currentStatus;
}

export async function getLibreTranslateRuntimeStatus(settings = getTranslationSettings()): Promise<TranslationRuntimeStatus> {
  const health = await checkLibreTranslateHealth(settings);
  if (health.usable) {
    return {
      state: libreTranslateProcess ? 'running' : 'already_running',
      url: settings.url,
      command: currentStatus.command,
      pid: libreTranslateProcess?.pid,
      attempts: currentStatus.attempts
    };
  }

  if (health.reachable && !health.usable) {
    return {
      state: 'unavailable',
      url: settings.url,
      command: currentStatus.command,
      pid: libreTranslateProcess?.pid,
      lastError: health.lastError,
      attempts: currentStatus.attempts,
      installHint: getInstallHint()
    };
  }

  return {
    ...currentStatus,
    url: settings.url
  };
}

export function stopLibreTranslateRuntime() {
  if (libreTranslateProcess && !libreTranslateProcess.killed) {
    try {
      libreTranslateProcess.kill();
    } catch (_) {}
  }
  libreTranslateProcess = null;
}

export function resetLibreTranslateRuntimeForTests() {
  stopLibreTranslateRuntime();
  currentStatus = {
    state: 'disabled',
    url: getTranslationSettings().url
  };
}
