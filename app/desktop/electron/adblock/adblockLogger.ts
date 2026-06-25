/**
 * adblockLogger.ts — Sistema de logging para el bloqueador de MapleVault
 * Registra todos los eventos de bloqueo con timestamp, tipo, URL y acción
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export type BlockEventType =
  | 'BLOCKED_POPUP'
  | 'BLOCKED_REDIRECT'
  | 'BLOCKED_AD_REQUEST'
  | 'BLOCKED_TRACKER'
  | 'BLOCKED_IFRAME'
  | 'BLOCKED_SCRIPT'
  | 'BLOCKED_OVERLAY'
  | 'BLOCKED_NAVIGATION'
  | 'BLOCKED_TAB'
  | 'BLOCKED_GHOSTERY';

export interface BlockEvent {
  timestamp: string;
  type: BlockEventType;
  url: string;
  sourceDomain: string;
  resourceType?: string;
  action: string;
}

// Estadísticas en memoria
let blockedCount = 0;
let sessionLog: BlockEvent[] = [];
const MAX_SESSION_LOG = 500; // Máximo de entradas en memoria

let logFilePath: string | null = null;

function ensureLogFile(): string {
  if (logFilePath) return logFilePath;
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const today = new Date().toISOString().slice(0, 10);
  logFilePath = path.join(logDir, `adblock-${today}.log`);
  return logFilePath;
}

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Registra un evento de bloqueo
 */
export function logBlockedEvent(
  type: BlockEventType,
  url: string,
  resourceType?: string,
  sourceDomain?: string
): void {
  const timestamp = formatTimestamp();
  const domain = sourceDomain || extractDomain(url);

  const event: BlockEvent = {
    timestamp,
    type,
    url: url.slice(0, 200), // Truncar URLs muy largas
    sourceDomain: domain,
    resourceType,
    action: 'DENIED',
  };

  // Incrementar contador
  blockedCount++;

  // Agregar al log en memoria
  sessionLog.push(event);
  if (sessionLog.length > MAX_SESSION_LOG) {
    sessionLog = sessionLog.slice(-MAX_SESSION_LOG);
  }

  // Escribir al archivo de log
  try {
    const logLine = `[${timestamp}] ${type} source=${domain} target=${url.slice(0, 150)}${resourceType ? ` type=${resourceType}` : ''}\n`;
    fs.appendFileSync(ensureLogFile(), logLine);
  } catch (err) {
    // Silenciar errores de I/O en logging
  }

  // Log a consola para desarrollo
  console.log(`[AdBlock] ${type}: ${url.slice(0, 100)}`);
}

/**
 * Obtiene el total de bloqueos en la sesión actual
 */
export function getBlockedCount(): number {
  return blockedCount;
}

/**
 * Obtiene el log reciente de la sesión
 */
export function getSessionLog(): BlockEvent[] {
  return [...sessionLog];
}

/**
 * Resetea el contador de la sesión
 */
export function resetSessionStats(): void {
  blockedCount = 0;
  sessionLog = [];
}
