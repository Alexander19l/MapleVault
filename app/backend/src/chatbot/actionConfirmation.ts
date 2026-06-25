/**
 * actionConfirmation.ts — Sistema de tokens de confirmación para acciones del chatbot
 * Las acciones destructivas requieren un token que expira en 5 minutos
 * Esto previene que el chatbot ejecute operaciones sin confirmación explícita del usuario
 */
import crypto from 'crypto';

interface PendingAction {
  token: string;
  actionType: string;
  actionData: any;
  createdAt: number;
  expiresAt: number;
  description: string;
}

// Almacén en memoria de tokens pendientes
const pendingActions = new Map<string, PendingAction>();

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Limpiar tokens expirados periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [token, action] of pendingActions.entries()) {
    if (action.expiresAt < now) {
      pendingActions.delete(token);
    }
  }
}, 60000);

/**
 * Registra una acción pendiente y devuelve un token de confirmación
 */
export function registerPendingAction(
  actionType: string,
  actionData: any,
  description: string
): string {
  const token = crypto.randomBytes(16).toString('hex');
  const now = Date.now();

  pendingActions.set(token, {
    token,
    actionType,
    actionData,
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
    description
  });

  return token;
}

/**
 * Valida y consume un token de confirmación
 * Devuelve la acción si el token es válido, null si expiró o no existe
 */
export function consumePendingAction(token: string): PendingAction | null {
  if (!token || typeof token !== 'string') return null;

  const action = pendingActions.get(token);
  if (!action) return null;

  if (Date.now() > action.expiresAt) {
    pendingActions.delete(token);
    return null;
  }

  // Consumir el token (uso único)
  pendingActions.delete(token);
  return action;
}

/**
 * Verifica si hay acciones pendientes (para debug/admin)
 */
export function getPendingActionsCount(): number {
  return pendingActions.size;
}

/**
 * Tipos de acciones que requieren confirmación
 */
export const DESTRUCTIVE_ACTIONS = [
  'delete_anime',
  'resolve_duplicates',
  'clear_library',
  'clear_user_list',
  'restore_backup'
] as const;

export type DestructiveActionType = typeof DESTRUCTIVE_ACTIONS[number];

/**
 * Tipos de acciones que solo requieren confirmación simple
 */
export const WRITE_ACTIONS = [
  'add_anime',
  'update_status',
  'batch_update_status',
  'update_score',
  'remove_from_list',
  'add_to_list'
] as const;

export type WriteActionType = typeof WRITE_ACTIONS[number];
