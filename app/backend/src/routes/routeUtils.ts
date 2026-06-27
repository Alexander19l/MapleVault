import type { Response } from 'express';
import { validateId, validatePayloadSize } from '../security/validators';

export function getErrorMessage(error: unknown, fallback = 'Error interno.'): string {
  return error instanceof Error ? error.message : fallback;
}

export function validateBodySize(res: Response, body: unknown): boolean {
  if (!validatePayloadSize(body)) {
    res.status(413).json({ error: 'Payload demasiado grande.' });
    return false;
  }
  return true;
}

export function getValidatedId(rawId: unknown, res: Response, message = 'ID invalido.'): number | null {
  const id = validateId(rawId);
  if (!id) {
    res.status(400).json({ error: message });
    return null;
  }
  return id;
}
