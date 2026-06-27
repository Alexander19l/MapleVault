import { validateAnimeInput } from '../security/validators';
import { sanitizeExternalAnime } from '../security/sanitize';

export interface AnimePayloadValidation {
  valid: boolean;
  errors: string[];
  data: Record<string, any>;
}

export function validateAnimePayload(raw: any, requireTitle = true): AnimePayloadValidation {
  const externalSafe = sanitizeExternalAnime(raw || {});
  const validation = validateAnimeInput(externalSafe);
  const errors = [...validation.errors];

  if (requireTitle && !externalSafe.title) {
    errors.push('El título es requerido.');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { ...externalSafe, ...validation.sanitized }
  };
}
