/**
 * sanitize.ts — Sanitización segura de contenido externo
 * Previene XSS al renderizar títulos, sinopsis e información proveniente de APIs externas
 */

/**
 * Sanitiza texto plano — elimina todas las etiquetas HTML y caracteres de control.
 * Usar para títulos, nombres de estudio, géneros, etc.
 */
export function sanitizePlainText(input: unknown): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
    .trim()
    .slice(0, 5000);
}

/**
 * Sanitiza sinopsis — permite solo formato básico pero elimina scripts y atributos peligrosos.
 * Convierte etiquetas de AniList (HTML) a texto seguro.
 */
export function sanitizeSynopsis(input: unknown): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  
  // AniList devuelve sinopsis con <br> e <i> que queremos conservar visualmente
  // pero eliminamos todo lo que sea potencialmente peligroso
  return str
    // Eliminar scripts primero
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    // Eliminar event handlers en atributos
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')
    // Eliminar href/src con javascript:
    .replace(/\s+(href|src|action)\s*=\s*["']javascript:[^"']*["']/gi, '')
    .replace(/\s+(href|src|action)\s*=\s*["']data:[^"']*["']/gi, '')
    // Eliminar iframes, object, embed
    .replace(/<(iframe|object|embed|form|input|button|select|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|form|input|button|select|textarea)[^>]*\/>/gi, '')
    // Conservar solo etiquetas básicas seguras: br, i, b, em, strong, p, span (sin atributos peligrosos)
    .replace(/<(?!\/?(?:br|i|b|em|strong|p|span)\b)[^>]+>/gi, '')
    // Limpiar atributos de las etiquetas permitidas (quitar todo excepto class)
    .replace(/<(i|b|em|strong|p|span)(\s[^>]*)?>/gi, (_match, tag) => `<${tag}>`)
    .slice(0, 10000);
}

/**
 * Elimina por completo todo el HTML — para usar en logs, notificaciones, etc.
 */
export function stripAllHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

/**
 * Sanitiza un objeto entero de anime obtenido de una API externa
 * antes de mostrarlo en el frontend o insertarlo en la DB.
 */
export function sanitizeExternalAnime(raw: Record<string, any>): Record<string, any> {
  return {
    ...raw,
    title: sanitizePlainText(raw.title),
    title_romaji: sanitizePlainText(raw.title_romaji),
    title_english: sanitizePlainText(raw.title_english),
    title_japanese: sanitizePlainText(raw.title_japanese),
    synopsis: sanitizeSynopsis(raw.synopsis),
    studio: sanitizePlainText(raw.studio),
    source_material: sanitizePlainText(raw.source_material),
    age_rating: sanitizePlainText(raw.age_rating),
    genres: Array.isArray(raw.genres)
      ? raw.genres.map((g: any) => sanitizePlainText(g)).filter(Boolean)
      : [],
    // No sanitizamos URLs de imagen aquí — se validan en validateImageUrl
    // No modificamos campos numéricos ni fechas
  };
}

/**
 * Sanitiza un mensaje de usuario antes de enviarlo al motor NLP local o proveedor IA configurado.
 * Previene prompt injection a través de caracteres de control o mensajes disfrazados.
 */
export function sanitizeChatInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    // Eliminar caracteres de control (salvo newline y tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Eliminar etiquetas HTML
    .replace(/<[^>]+>/g, '')
    // Limitar longitud
    .slice(0, 2000)
    .trim();
}

/**
 * Sanitiza la respuesta del chatbot antes de devolverla al frontend.
 * Previene que datos externos corruptos lleguen al usuario.
 */
export function sanitizeChatResponse(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  // La respuesta del bot puede tener markdown básico (**, *, -)
  // pero no debe tener HTML crudo ni scripts
  return text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '') // eliminar todo HTML
    .slice(0, 8000);
}

/**
 * Enmascara datos sensibles para logs — nunca loggear claves API ni tokens
 */
export function maskSensitiveData(data: unknown): string {
  const json = JSON.stringify(data, (key, value) => {
    const sensitiveKeys = ['apiKey', 'aiApiKey', 'password', 'token', 'secret', 'key', 'auth'];
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      return '[REDACTED]';
    }
    return value;
  }, 2);
  return json.slice(0, 1000); // max 1KB en logs
}
