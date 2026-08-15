import axios from 'axios';
import { getAISettings } from './aiSettings';
import { getFavoriteGenres, getMemory, getUserSoulData } from './memory';
import { detectLanguage } from './languageDetector';
import { parseIntentRegex } from './intentPipeline';
import type { NLPResult } from './types';

export { parseIntentRegex } from './intentPipeline';
export type { NLPResult } from './types';

export const INTENTS = [
  {
    id: 'buscar_serie',
    internalIntent: 'SEARCH_ANIME',
    description: 'Busca series en el catálogo local y, si hace falta, en fuentes online.',
    example: 'busca naruto',
    entities: ['query', 'source?'],
    protected: false
  },
  {
    id: 'agregar_serie',
    internalIntent: 'ADD_TO_LIBRARY',
    description: 'Prepara la importación de una serie y requiere confirmación antes de guardarla.',
    example: 'agrega el 2 a pendientes',
    entities: ['refIndexOrTitle', 'status?'],
    protected: true
  },
  {
    id: 'ver_info_serie',
    internalIntent: 'SHOW_ANIME_INFO',
    description: 'Muestra datos reales de una serie usando memoria reciente o catálogo local.',
    example: 'info death note',
    entities: ['refIndexOrTitle'],
    protected: false
  },
  {
    id: 'ver_catalogo',
    internalIntent: 'VIEW_CATALOG',
    description: 'Muestra una vista resumida del catálogo local con filtros básicos.',
    example: 'mi catalogo',
    entities: ['status?', 'genre?', 'order?'],
    protected: false
  },
  {
    id: 'continuar_catalogo',
    internalIntent: 'CONTINUE_CATALOG',
    description: 'Muestra la siguiente página de la última consulta del catálogo.',
    example: 'ver más series',
    entities: [],
    protected: false
  },
  {
    id: 'continuar_resultados',
    internalIntent: 'CONTINUE_RESULTS',
    description: 'Muestra la siguiente pagina de una busqueda, lista o recomendacion reciente.',
    example: 'ver mas resultados',
    entities: [],
    protected: false
  },
  {
    id: 'continuar_contexto',
    internalIntent: 'CONTINUE_ACTIVE',
    description: 'Continua la lista, busqueda o recomendacion activa segun el contexto reciente.',
    example: 'mostrame mas series',
    entities: [],
    protected: false
  },
  {
    id: 'pagina_anterior',
    internalIntent: 'PREVIOUS_ACTIVE_PAGE',
    description: 'Vuelve a la pagina anterior de la lista, busqueda o catalogo activo.',
    example: 'pagina anterior',
    entities: [],
    protected: false
  },
  {
    id: 'ir_a_pagina',
    internalIntent: 'NAVIGATE_ACTIVE_PAGE',
    description: 'Abre una pagina concreta de la lista, busqueda o catalogo activo.',
    example: 'ir a la pagina 3',
    entities: ['page'],
    protected: false
  },
  {
    id: 'eliminar_serie',
    internalIntent: 'REMOVE_FROM_LIBRARY',
    description: 'Prepara la eliminación de una serie y requiere confirmación.',
    example: 'elimina death note',
    entities: ['refIndexOrTitle'],
    protected: true
  },
  {
    id: 'recomendar_series',
    internalIntent: 'RECOMMEND_GENERAL',
    description: 'Sugiere series usando géneros, tonos, biblioteca local y preferencias recordadas.',
    example: 'quiero algo oscuro sin romance',
    entities: ['genre?', 'studio?', 'format?', 'durationPreference?', 'toneTags?', 'dislikedToneTags?'],
    protected: false
  },
  {
    id: 'recomendar_similares',
    internalIntent: 'RECOMMEND_SIMILAR',
    description: 'Sugiere series similares a una referencia verificada por géneros y metadatos disponibles.',
    example: 'recomiendame una serie como Baki',
    entities: ['refIndexOrTitle'],
    protected: false
  },
  {
    id: 'comparar_series',
    internalIntent: 'COMPARE_ANIME',
    description: 'Compara dos series por datos disponibles, géneros, episodios, puntaje y sinopsis.',
    example: 'cual es mejor, Fullmetal Alchemist de 2003 o Brotherhood',
    entities: ['title_1', 'title_2'],
    protected: false
  },
  {
    id: 'orden_visualizacion',
    internalIntent: 'WATCH_ORDER',
    description: 'Busca un orden de visualización para una saga o franquicia.',
    example: 'en que orden debo ver la saga Fate',
    entities: ['franchise'],
    protected: false
  },
  {
    id: 'actualizar_temporadas',
    internalIntent: 'BATCH_UPDATE_STATUS',
    description: 'Prepara una actualización por lote de temporadas y requiere confirmación.',
    example: 'marca toda la temporada 1 y 2 de Code Geass como vistas',
    entities: ['refIndexOrTitle', 'seasons', 'status'],
    protected: true
  },
  {
    id: 'actualizar_estado',
    internalIntent: 'UPDATE_STATUS',
    description: 'Cambia el estado de una serie local entre viendo, pendiente, completado, pausado o abandonado.',
    example: 'cambiar estado de Steins Gate a pausado',
    entities: ['refIndexOrTitle', 'status'],
    protected: true
  },
  {
    id: 'calificar_serie',
    internalIntent: 'RATE_ANIME',
    description: 'Asigna una calificación personal entre 0 y 10 a una serie local.',
    example: 'le doy un 9 de 10 a Vinland Saga',
    entities: ['refIndexOrTitle', 'score'],
    protected: true
  },
  {
    id: 'quitar_de_lista',
    internalIntent: 'REMOVE_FROM_LIST',
    description: 'Quita una serie de la lista personal sin eliminarla del catálogo local.',
    example: 'remove Boruto from my watching list',
    entities: ['refIndexOrTitle', 'list?'],
    protected: true
  },
  {
    id: 'limpiar_lista_personal',
    internalIntent: 'CLEAR_USER_LIST',
    description: 'Quita todas las series de la lista personal sin borrar el catálogo local.',
    example: 'borra mi watchlist',
    entities: [],
    protected: true
  },
  {
    id: 'recordar_preferencia',
    internalIntent: 'REMEMBER_PREFERENCE',
    description: 'Guarda preferencias explícitas para mejorar recomendaciones futuras.',
    example: 'me gusta algo oscuro',
    entities: ['genre?', 'studio?', 'format?', 'durationPreference?', 'toneTags?', 'dislikedToneTags?', 'refIndexOrTitle?', 'animeTitle?'],
    protected: false
  },
  {
    id: 'recordar_rechazo',
    internalIntent: 'REMEMBER_DISLIKE',
    description: 'Guarda preferencias que el usuario prefiere evitar en futuras recomendaciones.',
    example: 'no quiero romance',
    entities: ['genre?', 'studio?', 'format?', 'durationPreference?', 'toneTags?', 'dislikedToneTags?', 'refIndexOrTitle?', 'animeTitle?'],
    protected: false
  },
  {
    id: 'marcar_episodio_visto',
    internalIntent: 'MARK_EPISODE_WATCHED',
    description: 'Prepara el registro de un episodio visto y requiere confirmacion.',
    example: 'marca el episodio 3 de Naruto como visto',
    entities: ['refIndexOrTitle', 'episodeNumber'],
    protected: true
  },
  {
    id: 'siguiente_episodio_pendiente',
    internalIntent: 'NEXT_PENDING_EPISODE',
    description: 'Muestra el siguiente episodio pendiente de las series en progreso.',
    example: 'siguiente capitulo pendiente',
    entities: [],
    protected: false
  },
  {
    id: 'sincronizar_biblioteca',
    internalIntent: 'SYNC_LIBRARY',
    description: 'Prepara una sincronizacion de metadatos con AniList y requiere confirmacion.',
    example: 'sincroniza mi biblioteca',
    entities: [],
    protected: true
  },
  {
    id: 'cancelar_sincronizacion',
    internalIntent: 'CANCEL_SYNC',
    description: 'Solicita detener la sincronizacion activa al terminar el elemento actual.',
    example: 'cancela la sincronizacion',
    entities: [],
    protected: false
  },
  {
    id: 'resumen_sincronizacion',
    internalIntent: 'SYNC_SUMMARY',
    description: 'Muestra progreso, actualizaciones y errores de la sincronizacion actual.',
    example: 'resumen de sincronizacion',
    entities: [],
    protected: false
  },
  {
    id: 'ayuda',
    internalIntent: 'HELP',
    description: 'Muestra comandos disponibles generados desde capabilities.',
    example: 'ayuda',
    entities: [],
    protected: false
  }
] as const;

export const VALID_INTENTS = [
  'GREETING', 'THANKS', 'HELP', 'SEARCH_PENDING', 'SEARCH_COMPLETED', 'SEARCH_ANIME', 'VIEW_CATALOG', 'CONTINUE_CATALOG', 'CONTINUE_RESULTS', 'CONTINUE_ACTIVE', 'PREVIOUS_ACTIVE_PAGE', 'NAVIGATE_ACTIVE_PAGE',
  'SHOW_ANIME_INFO', 'LIBRARY_STATS', 'SYNC_LIBRARY', 'SYNC_METADATA', 'SYNC_EPISODES', 'CANCEL_SYNC',
  'SYNC_SUMMARY', 'COMPARE_ANIME', 'RECOMMEND_SIMILAR', 'RECOMMEND_GENERAL', 'SHOW_EPISODES',
  'MARK_ALL_WATCHED', 'MARK_EPISODE_WATCHED', 'LAST_WATCHED_EPISODE', 'NEXT_PENDING_EPISODE',
  'SORT_EPISODES_ASC', 'SORT_EPISODES_DESC', 'FILTER_EPISODES_WATCHED', 'FILTER_EPISODES_PENDING',
  'OPEN_EPISODE', 'ADD_TO_LIBRARY', 'REMOVE_FROM_LIBRARY', 'EDIT_ANIME', 'MARK_WATCHING',
  'MARK_COMPLETED', 'MARK_PENDING', 'MARK_DROPPED', 'ADD_FAVORITE', 'REMOVE_FAVORITE',
  'FIND_DUPLICATES', 'SORT_LIBRARY', 'EXPLAIN_SYNOPSIS', 'IS_FINISHED', 'HOW_MANY_EPISODES',
  'WATCH_ORDER', 'LIST_SEASONS', 'HAS_MOVIES_OVAS', 'SEARCH_SIMILAR', 'SEARCH_AVAILABLE_EPISODES',
  'SEARCH_POPULAR', 'REMEMBER_PREFERENCE', 'REMEMBER_DISLIKE', 'RECALL_PREFERENCE',
  'BATCH_UPDATE_STATUS', 'UPDATE_STATUS', 'RATE_ANIME', 'REMOVE_FROM_LIST',
  'EXPLAIN_CONCEPT', 'CLEAR_SEARCH_FILTERS', 'CLEAR_USER_LIST', 'RESET_PROFILE', 'UNSUPPORTED_DOWNLOAD', 'UNKNOWN'
] as const;

export async function parseIntent(message: string): Promise<NLPResult> {
  const regexResult = parseIntentRegex(message);

  if (regexResult.intent !== 'UNKNOWN') {
    return regexResult;
  }

  try {
    const settings = await getAISettings();
    if (settings.enabled) {
      return await parseIntentWithOllama(message, settings);
    }
  } catch (err) {
    console.error('Error al usar Ollama local, conservando resultado Regex:', err);
  }

  return regexResult;
}

function extractJSON(str: string): string {
  const start = str.indexOf('{');
  const end = str.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return str.substring(start, end + 1);
  }
  return str;
}

async function parseIntentWithOllama(message: string, settings: any): Promise<NLPResult> {
  const memoryGenres = await getFavoriteGenres();
  const systemInstructions = await getMemory<string[]>('system_instructions') || [];
  const userSoul = await getUserSoulData();

  const context = memoryGenres.length > 0
    ? `El usuario tiene estos géneros favoritos guardados en memoria: ${memoryGenres.join(', ')}.`
    : '';
  const instructions = systemInstructions.length > 0
    ? `REGLAS BASE APRENDIDAS:\n${systemInstructions.join('\n')}`
    : '';
  const soulInfo = userSoul
    ? `PERFIL DEL USUARIO: personalidad=${userSoul.personality}; completados=${userSoul.completedAnimeCount}; géneros_más_vistos=${userSoul.mostWatchedGenres?.join(', ')}.`
    : '';
  const validIntentList = VALID_INTENTS.join(', ');

  const prompt = `
[INST]
Eres el motor NLP de MapleVault, un gestor local de anime.
Tu única función es extraer intención y entidades. No ejecutes acciones.
Devuelve exclusivamente JSON válido, sin explicaciones ni texto adicional.

${context}
${instructions}
${soulInfo}

Intenciones válidas: ${validIntentList}

Entidades permitidas:
- animeTitle: título literal mencionado por el usuario.
- query: consulta de búsqueda si aplica.
- refIndexOrTitle: número o título referido desde resultados recientes.
- source: local u online.
- genre: géneros en inglés separados por coma.
- studio: estudio mencionado explícitamente.
- format: tv, movie, ova, ona o special.
- durationPreference: short, medium o long.
- toneTags: tonos preferidos verificados desde el texto.
- dislikedToneTags: tonos a evitar si el usuario usa negación.
- year, season, status, min_score, max_score.
- min_episodes, max_episodes: límites de episodios si el usuario pide ritmo o duración.
- duration_max: duración máxima por episodio o pieza, en minutos.
- tags, exclude_tags: temáticas o restricciones como hacking, vampire, technology, kids o family.
- airing_status: finished, airing o upcoming.
- sort_by: score_asc, score_desc, release_date_asc, release_date_desc o popularity_desc.
- staff, staff_role, source_material, demographic.
- exclude_franchise, exclude_related_to: raíz de una franquicia que no debe recomendarse.
- title_1, title_2: títulos para comparaciones.
- franchise: saga o franquicia para orden de visualización.
- seasons: números de temporada para actualizaciones por lote.

Reglas anti-alucinación:
1. No inventes títulos, géneros, estudios ni atributos.
2. Si no hay intención clara, usa UNKNOWN.
3. Si el usuario pide descargar capítulos, usa UNSUPPORTED_DOWNLOAD.
4. Si dice "una serie de X" o "un anime de X", X es género/filtro, no título.
5. Acciones de agregar, eliminar o editar solo deben clasificarse; nunca ejecutes nada.
6. Para "marca temporada(s) X de Título como vistas", usa BATCH_UPDATE_STATUS y entidades seasons/status/refIndexOrTitle.

Ejemplos:
"busca naruto" -> {"intent":"SEARCH_ANIME","entities":{"animeTitle":"naruto","query":"naruto"}}
"borra dbz" -> {"intent":"REMOVE_FROM_LIBRARY","entities":{"animeTitle":"dbz","refIndexOrTitle":"dbz"}}
"recomiendame algo de accion" -> {"intent":"RECOMMEND_GENERAL","entities":{"genre":"action"}}
"no me recomiendes peliculas largas" -> {"intent":"REMEMBER_DISLIKE","entities":{"format":"movie","durationPreference":"long"}}
"dame info del 3" -> {"intent":"SHOW_ANIME_INFO","entities":{"refIndexOrTitle":"3"}}
"recomiendame una serie como Baki" -> {"intent":"RECOMMEND_SIMILAR","entities":{"refIndexOrTitle":"baki","animeTitle":"baki"}}
"busca animes sobre hackers" -> {"intent":"SEARCH_ANIME","entities":{"tags":["cyberpunk","technology","hacking"]}}
"marca toda la temporada 1 y 2 de Code Geass como vistas" -> {"intent":"BATCH_UPDATE_STATUS","entities":{"refIndexOrTitle":"code geass","seasons":[1,2],"status":"completed"}}
"le doy un 9 de 10 a Vinland Saga" -> {"intent":"RATE_ANIME","entities":{"refIndexOrTitle":"vinland saga","score":9}}
"cambiar estado de Steins Gate a pausado" -> {"intent":"UPDATE_STATUS","entities":{"refIndexOrTitle":"steins gate","status":"on_hold"}}
"remove Boruto from my watching list" -> {"intent":"REMOVE_FROM_LIST","entities":{"refIndexOrTitle":"boruto","list":"watching"}}

Input del usuario como JSON string: ${JSON.stringify(message)}
[/INST]
  `;

  const endpoint = settings.provider === 'ollama'
    ? `${settings.url}/api/generate`
    : `${settings.url}/v1/chat/completions`;
  const payload = settings.provider === 'ollama'
    ? {
        model: settings.model,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: settings.temperature,
          num_ctx: settings.contextLimit,
          num_predict: settings.maxTokens
        }
      }
    : {
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: settings.temperature || 0.1,
        response_format: { type: 'json_object' }
      };

  const response = await axios.post(endpoint, payload, {
    timeout: 5000,
    maxRedirects: 0
  });
  const jsonStr = settings.provider === 'ollama'
    ? response.data.response
    : response.data.choices?.[0]?.message?.content || '';

  let parsed: any = { intent: 'UNKNOWN', entities: {} };
  try {
    parsed = JSON.parse(extractJSON(jsonStr));
  } catch (err) {
    console.error('[NLP JSON Parse Error] Raw:', jsonStr);
  }

  if (!parsed.intent) parsed.intent = 'UNKNOWN';
  if (typeof parsed.intent === 'string') parsed.intent = parsed.intent.trim().toUpperCase();
  if (!parsed.entities || typeof parsed.entities !== 'object') parsed.entities = {};

  if (!VALID_INTENTS.includes(parsed.intent as any)) {
    console.warn(`[NLP] Hallucinated intent: ${parsed.intent}, reverting to SEARCH_ANIME/UNKNOWN`);
    parsed.intent = parsed.entities.animeTitle ? 'SEARCH_ANIME' : 'UNKNOWN';
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[NLP Ollama] Intent: ${parsed.intent}`);
  }
  return {
    intent: parsed.intent,
    entities: parsed.entities,
    engine: 'ollama',
    language: detectLanguage(message),
    sanitized: true
  } as NLPResult;
}
