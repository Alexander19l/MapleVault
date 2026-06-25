import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_ACTIONS,
  CAPABILITY_CATEGORIES,
  FEATURED_PROMPTS,
  getCapabilitiesHelpText,
  getMapleAssistantCapabilities
} from '../capabilities';
import { parseIntentRegex } from '../intentPipeline';

describe('Maple Assistant - ayuda y consultas destacadas', () => {
  it.each(FEATURED_PROMPTS)(
    'interpreta la consulta destacada "$title" con la intencion declarada',
    ({ prompt, intent }) => {
      const result = parseIntentRegex(prompt);
      expect(result.intent).toBe(intent);
      expect(result.intent).not.toBe('UNKNOWN');
    }
  );

  it.each([
    'ayuda',
    '/ayuda',
    'help',
    '/help',
    'comandos',
    'opciones',
    'capacidades',
    'muestrame la ayuda',
    'que sabes hacer',
    'como te uso',
    'what can you do',
    'show help'
  ])('reconoce "%s" como solicitud de ayuda', input => {
    expect(parseIntentRegex(input).intent).toBe('HELP');
  });

  it.each([
    'ver más series de mi catálogo',
    'siguiente pagina del catalogo',
    'continua con mi catalogo',
    'show more anime from my catalog'
  ])('reconoce "%s" como continuación del catálogo', input => {
    const result = parseIntentRegex(input);
    expect(result.intent).toBe('CONTINUE_CATALOG');
    expect(result.entities.context_continuation).toBe(true);
  });

  it.each([
    'ver más series',
    'mostrame mas animes',
    'siguiente pagina',
    'show more anime'
  ])('reconoce "%s" como continuación contextual', input => {
    const result = parseIntentRegex(input);
    expect(result.intent).toBe('CONTINUE_ACTIVE');
    expect(result.entities.context_continuation).toBe(true);
  });

  it.each([
    'ver más resultados',
    'mostrar mas recomendaciones',
    'cargar más pendientes',
    'siguiente pagina de resultados',
    'show more results'
  ])('reconoce "%s" como continuación de resultados paginados', input => {
    const result = parseIntentRegex(input);
    expect(result.intent).toBe('CONTINUE_RESULTS');
    expect(result.entities.context_continuation).toBe(true);
  });

  it.each([
    'página anterior',
    'volver a la pagina anterior',
    'previous page',
    'back page'
  ])('reconoce "%s" como retroceso contextual', input => {
    const result = parseIntentRegex(input);
    expect(result.intent).toBe('PREVIOUS_ACTIVE_PAGE');
    expect(result.entities.context_continuation).toBe(true);
  });

  it.each([
    ['ir a la página 3', 3],
    ['mostrar pagina 2', 2],
    ['pagina 7', 7],
    ['go to page 4', 4]
  ])('reconoce "%s" como navegación directa', (input, page) => {
    const result = parseIntentRegex(String(input));
    expect(result.intent).toBe('NAVIGATE_ACTIVE_PAGE');
    expect(result.entities.page).toBe(page);
  });

  it('no interpreta un año como número de página', () => {
    const result = parseIntentRegex('busca animes de 2024');
    expect(result.intent).not.toBe('NAVIGATE_ACTIVE_PAGE');
  });

  it('genera ayuda agrupada desde el mismo contrato de capabilities', () => {
    const capabilities = getMapleAssistantCapabilities();
    const help = getCapabilitiesHelpText();

    expect(capabilities.categories).toEqual(CAPABILITY_CATEGORIES);
    expect(help).toContain(`Puedo ayudarte con ${capabilities.intents.length} funciones`);

    for (const category of CAPABILITY_CATEGORIES) {
      expect(help).toContain(`${category.label}:`);
    }

    for (const prompt of FEATURED_PROMPTS) {
      expect(help).toContain(prompt.prompt);
    }
  });

  it('mantiene todas las acciones de escritura detras de confirmacion', () => {
    const capabilities = getMapleAssistantCapabilities();
    const protectedIntents = capabilities.intents.filter(intent => intent.requiresConfirmation);

    expect(protectedIntents.length).toBeGreaterThan(0);
    expect(ASSISTANT_ACTIONS.every(action => action.requiresConfirmation)).toBe(true);
    expect(capabilities.safetyPolicy.writeActionsRequireToken).toBe(true);
  });

  it('no publica intents sin categoria o ejemplo ejecutable', () => {
    const capabilities = getMapleAssistantCapabilities();
    const categoryIds = new Set<string>(capabilities.categories.map(category => category.id));

    for (const intent of capabilities.intents) {
      expect(categoryIds.has(intent.category)).toBe(true);
      expect(intent.description.trim().length).toBeGreaterThan(10);
      expect(intent.example.trim().length).toBeGreaterThan(2);
    }
  });
});
