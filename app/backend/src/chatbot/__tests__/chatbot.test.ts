import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIntent } from '../nlpEngine';
import { handleLocalIntent } from '../localCommandHandler';
import { executeChatbotAction } from '../chatbot';
import { buildUserSoulProfile } from '../memory';
import * as db from '../../database/db';

// Mock DB implementation for tests
vi.mock('../../database/db', () => ({
  DB_PATH: process.cwd() + '/tmp/maplevault-test.sqlite',
  query: {
    run: vi.fn(),
    all: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null)
  }
}));

// Mock scraper
vi.mock('../../scraping/scraper', () => ({
  searchAniList: vi.fn().mockResolvedValue([{ title: 'Mock Anime', external_id: 1, source: 'AniList', genres: ['Action'] }]),
  searchAniListPage: vi.fn().mockResolvedValue({
    items: [{ title: 'Mock Anime', external_id: 1, source: 'AniList', genres: ['Action'] }],
    page: 1,
    pageSize: 6,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    available: true
  }),
  searchJikan: vi.fn().mockResolvedValue([]),
  searchJikanPage: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 6,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    available: true
  }),
  saveNormalizedAnimeToLocal: vi.fn()
}));

describe('1. Pruebas Unitarias de NLP Engine', async () => {
  it('Debería detectar búsqueda de anime de invierno 2025', async () => {
    const result = await parseIntent('Busca animes de invierno 2025');
    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.year).toBe(2025);
    expect(result.entities.season).toBe('winter');
  });

  it('Debería detectar marcación de todos los capítulos vistos', async () => {
    const result = await parseIntent('Marca todos los capítulos como vistos');
    expect(result.intent).toBe('MARK_ALL_WATCHED');
  });

  it('Debería detectar detección de duplicados', async () => {
    const result = await parseIntent('Detecta duplicados en mi biblioteca');
    expect(result.intent).toBe('FIND_DUPLICATES');
  });

  it('Debería detectar consulta de capítulos pendientes', async () => {
    const result = await parseIntent('Qué capítulos tengo pendientes');
    expect(result.intent).toBe('FILTER_EPISODES_PENDING');
  });

  it('Debería detectar sincronización de biblioteca', async () => {
    const result = await parseIntent('Sincroniza mi biblioteca');
    expect(result.intent).toBe('SYNC_LIBRARY');
  });

  it('Debería detectar memoria de género (REMEMBER_PREFERENCE)', async () => {
    const result = await parseIntent('Recuerda que me gusta el género mecha');
    expect(result.intent).toBe('REMEMBER_PREFERENCE');
    expect(result.entities.genre).toBe('mecha');
  });

  it('Deberia detectar rechazo de genero (REMEMBER_DISLIKE)', async () => {
    const result = await parseIntent('no me recomiendes mecha');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.genre).toBe('mecha');
  });

  it('Deberia detectar rechazo granular de formato y duracion', async () => {
    const result = await parseIntent('no me recomiendes peliculas largas');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.format).toBe('movie');
    expect(result.entities.durationPreference).toBe('long');
  });

  it('Deberia detectar preferencia de duracion corta', async () => {
    const result = await parseIntent('prefiero series cortas');
    expect(result.intent).toBe('REMEMBER_PREFERENCE');
    expect(result.entities.durationPreference).toBe('short');
  });

  it('Deberia detectar rechazo de estudio', async () => {
    const result = await parseIntent('no me recomiendes estudio trigger');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.studio).toBe('trigger');
  });

  it('Deberia detectar preferencia por serie concreta', async () => {
    const result = await parseIntent('me gustó death note');
    expect(result.intent).toBe('REMEMBER_PREFERENCE');
    expect(result.entities.refIndexOrTitle).toBe('death note');
    expect(result.entities.animeTitle).toBe('death note');
  });

  it('Deberia detectar rechazo por serie concreta', async () => {
    const result = await parseIntent('no me interesa frieren');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.refIndexOrTitle).toBe('frieren');
    expect(result.entities.animeTitle).toBe('frieren');
  });

  it('Deberia mantener rechazo de genero sin confundirlo con titulo', async () => {
    const result = await parseIntent('no me recomiendes mecha');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.genre).toBe('mecha');
    expect(result.entities.refIndexOrTitle).toBeUndefined();
  });

  it('Deberia detectar recomendacion por tono con restriccion negativa', async () => {
    const result = await parseIntent('quiero algo oscuro sin romance');
    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities.toneTags).toContain('dark');
    expect(result.entities.dislikedToneTags).toContain('romance_focus');
    expect(result.entities.genre).toBeUndefined();
  });

  it('Deberia detectar rechazo de tono sin tratarlo como titulo', async () => {
    const result = await parseIntent('no quiero romance');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.dislikedToneTags).toContain('romance_focus');
    expect(result.entities.refIndexOrTitle).toBeUndefined();
  });

  it('Deberia detectar ayuda dinamica', async () => {
    const result = await parseIntent('ayuda');
    expect(result.intent).toBe('HELP');
  });

  it('No debe asumir busqueda cuando el mensaje es ambiguo', async () => {
    const result = await parseIntent('naruto');
    expect(result.intent).toBe('UNKNOWN');
  });

  it('Deberia detectar referencia numerica para agregar', async () => {
    const result = await parseIntent('agrega el 2 a pendientes');
    expect(result.intent).toBe('ADD_TO_LIBRARY');
    expect(result.entities.refIndexOrTitle).toBe('2');
    expect(result.entities.status).toBe('plan_to_watch');
  });

  it('Deberia detectar informacion usando referencia "del 3"', async () => {
    const result = await parseIntent('dame info del 3');
    expect(result.intent).toBe('SHOW_ANIME_INFO');
    expect(result.entities.refIndexOrTitle).toBe('3');
  });

  it('Deberia detectar recomendacion con genero compuesto', async () => {
    const result = await parseIntent('Recomiendame una serie de comedia romantica');
    expect(result.intent).toBe('RECOMMEND_GENERAL');
    const genres = String(result.entities.genre).split(',').map(genre => genre.trim());
    expect(genres).toEqual(expect.arrayContaining(['comedy', 'romance']));
  });

  it('Suite extensa: detecta busqueda exacta y titulo romaji', async () => {
    const exact = await parseIntent('Busca Naruto');
    expect(exact.intent).toBe('SEARCH_ANIME');
    expect(exact.entities.query).toBe('naruto');

    const romaji = await parseIntent('Busca Shingeki no Kyojin');
    expect(romaji.intent).toBe('SEARCH_ANIME');
    expect(romaji.entities.query).toBe('shingeki no kyojin');
  });

  it('Suite extensa: extrae filtros combinados de genero, score y rango de anos', async () => {
    const result = await parseIntent('busca un isekai de los ultimos 2 anos con mas de 8 de puntuacion');
    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.genre).toBe('isekai');
    expect(result.entities.min_score).toBe(8);
    expect(result.entities.year_from).toBeGreaterThanOrEqual(new Date().getFullYear() - 1);
  });

  it('Suite extensa: mapea temporada, estudio, formato y decada', async () => {
    const season = await parseIntent('que salio en otono 2023');
    expect(season.intent).toBe('SEARCH_ANIME');
    expect(season.entities.season).toBe('fall');
    expect(season.entities.year).toBe(2023);

    const studio = await parseIntent('muestrame animes de MAPPA');
    expect(studio.intent).toBe('SEARCH_ANIME');
    expect(studio.entities.studio).toBe('mappa');

    const format = await parseIntent('OVAs de los 90');
    expect(format.intent).toBe('SEARCH_ANIME');
    expect(format.entities.format).toBe('ova');
    expect(format.entities.year_from).toBe(1990);
    expect(format.entities.year_to).toBe(1999);
  });

  it('Suite extensa: detecta recomendacion directa, similar y exclusion implicita', async () => {
    const direct = await parseIntent('dame una sugerencia');
    expect(direct.intent).toBe('RECOMMEND_GENERAL');

    const similar = await parseIntent('algo como Sword Art Online pero mejor');
    expect(similar.intent).toBe('RECOMMEND_SIMILAR');
    expect(similar.entities.refIndexOrTitle).toBe('sword art online');

    const excluded = await parseIntent('aparte de Dragon Ball, que shounen clasico me recomiendas?');
    expect(excluded.intent).toBe('RECOMMEND_GENERAL');
    expect(excluded.entities.exclude_titles).toContain('Dragon Ball');
  });

  it('Suite extensa: reconoce idioma y no confunde smalltalk con busqueda', async () => {
    const spanish = await parseIntent('busca un anime de accion con mucho drama');
    expect(spanish.language).toBe('es');

    const english = await parseIntent('recommend me a good action anime with drama');
    expect(english.language).toBe('en');

    const smalltalk = await parseIntent('como estas?');
    expect(smalltalk.intent).toBe('GREETING');
  });

  it('Suite extensa: captura rechazo de ecchi como genero y no como titulo', async () => {
    const result = await parseIntent('no me gustan los animes de ecchi para nada');
    expect(result.intent).toBe('REMEMBER_DISLIKE');
    expect(result.entities.genre).toBe('ecchi');
    expect(result.entities.refIndexOrTitle).toBeUndefined();
  });

  it('Suite v2: detecta busqueda por ritmo corto para fin de semana', async () => {
    const result = await parseIntent('Recomiendame un anime corto para ver este fin de semana');
    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.max_episodes).toBe(13);
    expect(result.entities.format).toBe('tv');
  });

  it('Suite v2: detecta busqueda semantica de hackers y tecnologia', async () => {
    const result = await parseIntent('Busca animes sobre hackers, computadoras o terminales');
    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.tags).toEqual(expect.arrayContaining(['cyberpunk', 'technology', 'hacking']));
    expect(result.entities.animeTitle).toBeUndefined();
  });

  it('Suite v2: detecta comparacion entre dos series', async () => {
    const result = await parseIntent('Cual es mejor, Fullmetal Alchemist de 2003 o Brotherhood?');
    expect(result.intent).toBe('COMPARE_ANIME');
    expect(result.entities.title_1).toBe('fullmetal alchemist');
    expect(result.entities.title_2).toBe('fullmetal alchemist: brotherhood');
  });

  it('Suite v2: detecta orden de visualizacion por franquicia', async () => {
    const result = await parseIntent('En que orden debo ver la saga Fate?');
    expect(result.intent).toBe('WATCH_ORDER');
    expect(result.entities.franchise).toBe('fate');
  });

  it('Suite v2: detecta actualizacion por lote de temporadas', async () => {
    const result = await parseIntent('Marca toda la temporada 1 y 2 de Code Geass como vistas');
    expect(result.intent).toBe('BATCH_UPDATE_STATUS');
    expect(result.entities.refIndexOrTitle).toBe('code geass');
    expect(result.entities.seasons).toEqual([1, 2]);
    expect(result.entities.status).toBe('completed');
  });

  it('Suite v2: detecta exclusion de audiencia infantil en recomendacion', async () => {
    const result = await parseIntent('Quiero un shounen, pero que no sea para niños');
    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities.genre).toBe('shounen');
    expect(result.entities.exclude_tags).toEqual(expect.arrayContaining(['kids', 'family']));
  });

  it('Suite v2: detecta jerga regional como calidad alta y accion', async () => {
    const result = await parseIntent('Recomiendame un anime que sea bravazo, con harta accion');
    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities.genre).toBe('action');
    expect(result.entities.min_score).toBe(8);
    expect(result.entities.tags).toEqual(expect.arrayContaining(['highly rated', 'intense action']));
  });

  it('Suite v2: usa emojis como contexto semantico sin romper sanitizacion', async () => {
    const result = await parseIntent('Busca algo asi 🧛‍♂️🦇🩸🏰');
    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.tags).toEqual(expect.arrayContaining(['vampire', 'gore', 'dark fantasy']));
  });

  it('Suite v2: detecta mood temporal triste sin convertirlo en gusto permanente', async () => {
    const result = await parseIntent('Hoy tuve un mal dia, quiero ver algo triste para llorar');
    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities.toneTags).toContain('emotional');
  });

  it('Suite v2: detecta preferencia explicita de epoca de los 90s', async () => {
    const result = await parseIntent('Solo me gustan los animes con estilo de los 90s');
    expect(result.intent).toBe('REMEMBER_PREFERENCE');
    expect(result.entities.year_from).toBe(1990);
    expect(result.entities.year_to).toBe(1999);
  });
});

describe('2. Pruebas de Integración - Comandos del Chatbot', async () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (db.query.run as any).mockResolvedValue(undefined);
    (db.query.all as any).mockReset().mockResolvedValue([]);
    (db.query.get as any).mockReset().mockResolvedValue(null);
  });

  it('Recomiéndame algo según mi lista - usa datos locales', async () => {
    (db.query.get as any).mockImplementation((_sql: string, params?: any[]) => {
      if (params?.[0] === 'favorite_genres') {
        return Promise.resolve({ value: JSON.stringify(['action']) });
      }
      return Promise.resolve(null);
    });
    (db.query.all as any).mockResolvedValueOnce([{ id: 1, title: 'Action Anime', genres: 'Action' }]);

    const response = await handleLocalIntent({ intent: 'RECOMMEND_GENERAL', entities: {} });
    expect(response.text).toContain('Te podría gustar');
    expect(response.visualData?.type).toBe('anime_page');
  });

  it('Ayuda - se genera desde capabilities', async () => {
    const response = await handleLocalIntent({ intent: 'HELP', entities: {} });
    expect(response.text).toContain('funciones principales');
    expect(response.visualData?.type).toBe('assistant_help');
    expect(response.visualData?.data.categories.length).toBeGreaterThan(0);
    expect(response.visualData?.data.intents.length).toBeGreaterThan(0);
    expect(response.visualData?.data.featuredPrompts.length).toBeGreaterThan(0);
  });

  it('Saludo - informa cómo acceder a más comandos', async () => {
    const response = await handleLocalIntent({ intent: 'GREETING', entities: {} });
    expect(response.text.toLowerCase()).toContain('ayuda');
    expect(response.text).toContain('más comandos');
  });

  it('Guarda listas de pendientes como contexto reciente para referencias por número', async () => {
    (db.query.all as any).mockResolvedValueOnce([
      { id: 10, title: 'Pending Anime', source: 'local', episodes: 12 }
    ]);

    const response = await handleLocalIntent({ intent: 'SEARCH_PENDING', entities: {} });

    expect(response.visualData?.type).toBe('anime_page');
    expect(response.visualData?.data.items[0].title).toBe('Pending Anime');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining([
        'last_search_results',
        expect.stringContaining('"title":"Pending Anime"')
      ])
    );
  });

  it('Recuerda generos rechazados para recomendaciones futuras', async () => {
    (db.query.get as any).mockResolvedValueOnce(null);

    const response = await handleLocalIntent({ intent: 'REMEMBER_DISLIKE', entities: { genre: 'mecha' } });

    expect(response.text).toContain('evitar');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['disliked_genres', JSON.stringify(['mecha'])])
    );
  });

  it('Recuerda rechazos granulares para recomendaciones futuras', async () => {
    (db.query.get as any).mockResolvedValue(null);

    const response = await handleLocalIntent({
      intent: 'REMEMBER_DISLIKE',
      entities: { studio: 'trigger', format: 'movie', durationPreference: 'long' }
    });

    expect(response.text).toContain('evitar');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['disliked_studios', JSON.stringify(['trigger'])])
    );
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['disliked_formats', JSON.stringify(['movie'])])
    );
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['disliked_episode_lengths', JSON.stringify(['long'])])
    );
  });

  it('Recuerda tono preferido para recomendaciones futuras', async () => {
    (db.query.get as any).mockResolvedValue(null);

    const response = await handleLocalIntent({
      intent: 'REMEMBER_PREFERENCE',
      entities: { toneTags: ['dark'] }
    });

    expect(response.text).toContain('priorizar');
    expect(response.text).toContain('tono oscuro');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['favorite_tone_tags', JSON.stringify(['dark'])])
    );
  });

  it('Recuerda tono rechazado para recomendaciones futuras', async () => {
    (db.query.get as any).mockResolvedValue(null);

    const response = await handleLocalIntent({
      intent: 'REMEMBER_DISLIKE',
      entities: { dislikedToneTags: ['romance_focus'] }
    });

    expect(response.text).toContain('evitar');
    expect(response.text).toContain('tono romance');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['disliked_tone_tags', JSON.stringify(['romance_focus'])])
    );
  });

  it('Recuerda una serie rechazada para recomendaciones futuras', async () => {
    (db.query.get as any).mockImplementation((sql: string, params?: any[]) => {
      if (params?.[0] === 'disliked_anime') {
        return Promise.resolve(null);
      }
      if (String(sql).includes('FROM anime a')) {
        return Promise.resolve({
          id: 99,
          external_id: 120332,
          source: 'AniList',
          title: 'Frieren'
        });
      }
      return Promise.resolve(null);
    });

    const response = await handleLocalIntent({
      intent: 'REMEMBER_DISLIKE',
      entities: { animeTitle: 'frieren', refIndexOrTitle: 'frieren' }
    });

    expect(response.text).toContain('evitar');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['disliked_anime', expect.stringContaining('"title":"Frieren"')])
    );
  });

  it('Marca todos los capítulos como vistos - pide confirmación', async () => {
    const response = await handleLocalIntent({ intent: 'MARK_ALL_WATCHED', entities: {} });
    expect(response.action).toBeDefined();
    expect(response.action?.type).toBe('mark_all_watched');
  });

  it('Busca animes de invierno 2025 - devuelve respuesta esperada', async () => {
    const response = await handleLocalIntent({ intent: 'SEARCH_ANIME', entities: { season: 'winter', year: 2025 } });
    expect(response.text).toContain('No encontré resultados verificados');
  });

  it('Detecta duplicados - pide confirmación indirecta', async () => {
    (db.query.all as any).mockResolvedValueOnce([{ title: 'Dup', count: 2, sources: 'local' }]);
    const response = await handleLocalIntent({ intent: 'FIND_DUPLICATES', entities: {} });
    expect(response.text).toContain('He encontrado 1 posibles duplicados');
    expect(response.visualData?.type).toBe('anime_duplicates');
  });

  it('Sincroniza mi biblioteca - muestra advertencia', async () => {
    const response = await handleLocalIntent({ intent: 'SYNC_LIBRARY', entities: {} });
    expect(response.action?.type).toBe('sync_all');
  });

  it('Genera perfil de memoria, gustos y rastro del usuario desde SQLite', async () => {
    (db.query.get as any)
      .mockResolvedValueOnce({ count: 120 })
      .mockResolvedValueOnce({ count: 42 })
      .mockResolvedValueOnce({ value: JSON.stringify(['action']) })
      .mockResolvedValueOnce({ value: JSON.stringify(['horror']) });

    (db.query.all as any)
      .mockResolvedValueOnce([
        { genre: 'Action', total: 12, completed: 5, favorites: 2, dropped: 0, averageUserScore: 8.4 },
        { genre: 'Horror', total: 10, completed: 1, favorites: 0, dropped: 4, averageUserScore: 3.2 }
      ])
      .mockResolvedValueOnce([{ studio: 'Madhouse', total: 4, averageUserScore: 8.8 }])
      .mockResolvedValueOnce([{ type: 'TV', total: 80 }])
      .mockResolvedValueOnce([{ status: 'completed', total: 20 }, { status: 'plan_to_watch', total: 7 }]);

    const profile = await buildUserSoulProfile();

    expect(profile.librarySize).toBe(120);
    expect(profile.trackedSeries).toBe(42);
    expect(profile.favoriteGenres).toContain('action');
    expect(profile.dislikedGenres).toContain('horror');
    expect(profile.inferredGenres[0].genre).toBe('Action');
    expect(profile.trace.join('\n')).toContain('Género Action');
    expect(profile.recommendationHints.length).toBeGreaterThan(0);
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['user_soul_profile'])
    );
  });

  it('Recomendaciones usan generos inferidos del perfil cuando no hay preferencia explicita', async () => {
    (db.query.get as any).mockImplementation((_sql: string, params?: any[]) => {
      if (params?.[0] === 'user_soul_profile') {
        return Promise.resolve({
        value: JSON.stringify({
          inferredGenres: [{ genre: 'Mystery', weight: 88 }]
        })
      });
      }
      return Promise.resolve(null);
    });
    (db.query.all as any).mockResolvedValueOnce([
      { id: 10, title: 'Mystery Pick', genres_joined: 'Mystery,Drama', score: 8.5, popularity: 20000 },
      { id: 11, title: 'Plain Pick', genres_joined: 'Comedy', score: 7.2, popularity: 5000 }
    ]);

    const response = await handleLocalIntent({ intent: 'RECOMMEND_GENERAL', entities: {} });

    expect(response.text).toContain('Mystery Pick');
    expect(response.visualData?.data.items[0].title).toBe('Mystery Pick');
    expect(response.visualData?.data.items[0].recommendation_reason).toContain('coincide');
  });

  it('Suite extensa: una busqueda demasiado vaga pide refinamiento', async () => {
    const response = await handleLocalIntent({ intent: 'SEARCH_ANIME', entities: {} });
    expect(response.text).toContain('criterio');
    expect(db.query.all).not.toHaveBeenCalled();
  });

  it('Suite extensa: la descarga no se anuncia como capacidad disponible', async () => {
    const parsed = await parseIntent('puedes descargar este anime por mi?');
    expect(parsed.intent).toBe('UNSUPPORTED_DOWNLOAD');

    const response = await handleLocalIntent(parsed);
    expect(response.text).toContain('descarga');
  });

  it('Suite extensa: la busqueda local aplica filtros avanzados en SQL', async () => {
    (db.query.all as any).mockResolvedValueOnce([]);

    await handleLocalIntent({
      intent: 'SEARCH_ANIME',
      entities: {
        genre: 'isekai',
        studio: 'mappa',
        format: 'tv',
        min_score: 8,
        year_from: 2025,
        year_to: 2026
      }
    });

    const sql = String((db.query.all as any).mock.calls[0][0]);
    const params = (db.query.all as any).mock.calls[0][1];
    expect(sql).toContain('LOWER(g.name) IN');
    expect(sql).toContain('LOWER(a.studio) LIKE');
    expect(sql).toContain('LOWER(a.type) =');
    expect(sql).toContain('a.score >=');
    expect(sql).toContain('a.year >=');
    expect(sql).toContain('a.year <=');
    expect(params).toEqual(expect.arrayContaining(['isekai', '%mappa%', 'tv', 2025, 2026, 8]));
  });

  it('Suite extensa: recomendaciones excluyen completados, abandonados y en curso desde SQL', async () => {
    (db.query.all as any).mockResolvedValueOnce([]);

    await handleLocalIntent({ intent: 'RECOMMEND_GENERAL', entities: { genre: 'shounen' } });

    const sql = String((db.query.all as any).mock.calls[0][0]);
    expect(sql).toContain("ul.watch_status IS NULL OR ul.watch_status = 'plan_to_watch'");
    expect(sql).not.toContain("ul.watch_status != 'completed'");
  });

  it('Suite extensa: recomendaciones penalizan titulos recomendados recientemente', async () => {
    const now = new Date().toISOString();
    (db.query.get as any).mockImplementation((_sql: string, params?: any[]) => {
      if (params?.[0] === 'recent_recommendations') {
        return Promise.resolve({
          value: JSON.stringify({
            createdAt: now,
            items: [{ title: 'Naruto', titleKey: 'naruto', createdAt: now }]
          })
        });
      }
      return Promise.resolve(null);
    });
    (db.query.all as any).mockResolvedValueOnce([
      { id: 1, title: 'Naruto', genres_joined: 'Shounen', score: 9.2, popularity: 100000 },
      { id: 2, title: 'Bleach', genres_joined: 'Shounen', score: 8.1, popularity: 1000 }
    ]);

    const response = await handleLocalIntent({ intent: 'RECOMMEND_GENERAL', entities: { genre: 'shounen' } });

    expect(response.visualData?.data.items[0].title).toBe('Bleach');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assistant_memory'),
      expect.arrayContaining(['recent_recommendations'])
    );
  });

  it('Suite extensa: acciones destructivas rechazan ejecucion sin token', async () => {
    const result = await executeChatbotAction('delete_anime', { animeId: 1, title: 'Naruto' });
    expect(result).toMatch(/requiere una confirmaci/i);
  });
});
