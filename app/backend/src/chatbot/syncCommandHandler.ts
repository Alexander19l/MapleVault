import type { ChatResponse } from './chatResponse';
import { syncJobManager } from './syncJobManager';

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: 'sin actividad',
    running: 'en ejecución',
    cancelling: 'cancelando',
    completed: 'completada',
    cancelled: 'cancelada',
    failed: 'con error'
  };
  return labels[status] || status;
}

export function handleCancelSync(): ChatResponse {
  const result = syncJobManager.requestCancellation();
  if (!result.accepted) {
    return {
      text: `No hay una sincronización activa para cancelar. Estado actual: ${statusLabel(result.snapshot.status)}.`
    };
  }

  return {
    text: 'Cancelación solicitada. La sincronización se detendrá al finalizar el elemento actual.'
  };
}

export function handleSyncSummary(): ChatResponse {
  const snapshot = syncJobManager.getSnapshot();
  if (snapshot.status === 'idle') {
    return { text: 'Todavía no se ejecutó una sincronización en esta sesión.' };
  }

  const progress = snapshot.total > 0
    ? `${snapshot.processed}/${snapshot.total}`
    : String(snapshot.processed);
  const errorDetail = snapshot.errorMessage ? ` Error: ${snapshot.errorMessage}.` : '';

  return {
    text: [
      `Sincronización ${statusLabel(snapshot.status)}.`,
      `Progreso: ${progress}.`,
      `Actualizados: ${snapshot.updated}.`,
      `Errores: ${snapshot.errors}.${errorDetail}`
    ].join(' ')
  };
}
