import { INTENTS } from './nlpEngine';

export const CAPABILITY_CATEGORIES = [
  {
    id: 'discover',
    label: 'Descubrir series',
    description: 'Busqueda, informacion, comparacion y recomendaciones.'
  },
  {
    id: 'library',
    label: 'Gestionar biblioteca',
    description: 'Catalogo, estados, calificaciones y acciones protegidas.'
  },
  {
    id: 'preferences',
    label: 'Personalizar recomendaciones',
    description: 'Memoria de gustos, rechazos y perfil del usuario.'
  },
  {
    id: 'assistant',
    label: 'Asistente',
    description: 'Ayuda y consulta de capacidades disponibles.'
  }
] as const;

export const FEATURED_PROMPTS = [
  {
    id: 'search_theme',
    title: 'Buscar por tematica',
    prompt: 'Busca animes sobre hackers, computadoras o terminales',
    intent: 'SEARCH_ANIME'
  },
  {
    id: 'recommend_filters',
    title: 'Recomendacion combinada',
    prompt: 'Recomiendame una comedia romantica corta',
    intent: 'RECOMMEND_GENERAL'
  },
  {
    id: 'recommend_similar',
    title: 'Buscar algo similar',
    prompt: 'Recomiendame una serie como Baki',
    intent: 'RECOMMEND_SIMILAR'
  },
  {
    id: 'view_catalog',
    title: 'Consultar catalogo',
    prompt: 'Muestrame mi catalogo',
    intent: 'VIEW_CATALOG'
  }
] as const;

function getIntentCategory(internalIntent: string) {
  if (['SEARCH_ANIME', 'SHOW_ANIME_INFO', 'RECOMMEND_GENERAL', 'RECOMMEND_SIMILAR', 'COMPARE_ANIME', 'WATCH_ORDER', 'CONTINUE_RESULTS', 'CONTINUE_ACTIVE', 'PREVIOUS_ACTIVE_PAGE', 'NAVIGATE_ACTIVE_PAGE'].includes(internalIntent)) {
    return 'discover';
  }
  if (['REMEMBER_PREFERENCE', 'REMEMBER_DISLIKE'].includes(internalIntent)) {
    return 'preferences';
  }
  if (internalIntent === 'HELP') {
    return 'assistant';
  }
  return 'library';
}

export const ASSISTANT_ACTIONS = [
  {
    type: 'add_anime',
    description: 'Importa una serie verificada y la agrega a la biblioteca local.',
    requiresConfirmation: true
  },
  {
    type: 'delete_anime',
    description: 'Elimina una serie de la biblioteca local.',
    requiresConfirmation: true
  },
  {
    type: 'resolve_duplicates',
    description: 'Resuelve duplicados detectados para un titulo especifico.',
    requiresConfirmation: true
  },
  {
    type: 'update_status',
    description: 'Actualiza el estado de seguimiento en la lista personal.',
    requiresConfirmation: true
  },
  {
    type: 'update_score',
    description: 'Actualiza la calificacion personal de una serie.',
    requiresConfirmation: true
  },
  {
    type: 'remove_from_list',
    description: 'Quita una serie de la lista personal sin borrarla del catalogo.',
    requiresConfirmation: true
  },
  {
    type: 'clear_user_list',
    description: 'Limpia la lista personal sin eliminar el catalogo local.',
    requiresConfirmation: true
  },
  {
    type: 'mark_watched',
    description: 'Marca o desmarca un episodio puntual como visto.',
    requiresConfirmation: true
  },
  {
    type: 'mark_all_watched',
    description: 'Marca como completadas las series pendientes o en progreso.',
    requiresConfirmation: true
  },
  {
    type: 'batch_update_status',
    description: 'Actualiza por lote temporadas resueltas de una serie.',
    requiresConfirmation: true
  },
  {
    type: 'sync_all',
    description: 'Sincroniza metadatos de la biblioteca con fuentes externas.',
    requiresConfirmation: true
  }
] as const;

export function getMapleAssistantCapabilities() {
  return {
    assistant: {
      name: 'Maple Assistant',
      product: 'MapleVault',
      executionMode: 'local-first',
      defaultNlp: 'regex',
      optionalNlp: 'Ollama compatible local endpoint',
      personality: 'cercano, breve y preciso',
      dataPolicy: 'no inventa datos; usa SQLite local o fuentes externas reales'
    },
    categories: CAPABILITY_CATEGORIES,
    intents: INTENTS.map(intent => ({
      id: intent.id,
      internalIntent: intent.internalIntent,
      category: getIntentCategory(intent.internalIntent),
      description: intent.description,
      example: intent.example,
      entities: intent.entities,
      requiresConfirmation: intent.protected
    })),
    supportedIntents: INTENTS.map(intent => intent.internalIntent),
    actions: ASSISTANT_ACTIONS,
    safetyPolicy: {
      inputSanitization: true,
      outputSanitization: true,
      writeActionsRequireToken: true,
      actionAllowList: true,
      persistentSearchContextTtlMinutes: 30,
      auditTrail: 'assistant_prompt_runs and bot_actions.log'
    },
    examples: INTENTS.map(intent => intent.example),
    featuredPrompts: FEATURED_PROMPTS,
    continuousImprovement: [
      'Agregar cada nueva intencion al catalogo INTENTS, al parser, al handler, a capabilities y a tests.',
      'Mantener acciones de escritura detras del flujo de confirmacion con token.',
      'Medir latencia, errores e intenciones desconocidas desde el historial de acciones.',
      'Preferir consultas locales antes de usar red para conservar privacidad y resiliencia.',
      'Usar Ollama solo para interpretar o redactar sobre datos ya verificados.'
    ],
    endpoints: {
      message: 'POST /chat/message',
      executeAction: 'POST /chat/execute-action',
      history: 'GET /chat/history',
      actionHistory: 'GET /chat/actions/history',
      capabilities: 'GET /chat/capabilities'
    }
  };
}

export function getCapabilitiesHelpText(): string {
  const capabilities = getMapleAssistantCapabilities();
  const sections = capabilities.categories.flatMap(category => {
    const intents = capabilities.intents.filter(intent => intent.category === category.id);
    if (intents.length === 0) return [];

    return [
      '',
      `${category.label}:`,
      ...intents.map(intent => {
        const suffix = intent.requiresConfirmation ? ' [requiere confirmacion]' : '';
        return `- ${intent.description} Ejemplo: "${intent.example}".${suffix}`;
      })
    ];
  });

  return [
    `Puedo ayudarte con ${capabilities.intents.length} funciones:`,
    ...sections,
    '',
    'Prueba una de estas consultas:',
    ...capabilities.featuredPrompts.map(item => `- ${item.prompt}`),
    '',
    'Las acciones que modifican tu biblioteca siempre requieren confirmacion.'
  ].join('\n');
}
