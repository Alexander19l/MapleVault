import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeChatbotAction } from '../actionExecutor';
import { registerPendingAction } from '../actionConfirmation';
import { buildAnimeSearchPlan } from '../searchQueryPlanner';
import { parseIntentRegex } from '../intentPipeline';
import { handleChatMessage } from '../chatOrchestrator';
import { addDislikedToneTag, addFavoriteToneTag, getRecommendationMemoryPreferences } from '../memory';
import * as db from '../../database/db';

const memoryStore = new Map<string, unknown>();

vi.mock('../../database/db', () => ({
  DB_PATH: process.cwd() + '/tmp/maplevault-semantic-stress.sqlite',
  query: {
    run: vi.fn(),
    all: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('../../scraping/scraper', () => ({
  searchAniList: vi.fn().mockResolvedValue([]),
  searchAniListPage: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 6,
    total: 0,
    totalPages: 0,
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

describe('Maple Assistant - filtros anidados y semántica avanzada', () => {
  beforeEach(() => {
    memoryStore.clear();
    vi.clearAllMocks();

    (db.query.get as any).mockImplementation((sql: string, params?: unknown[]) => {
      if (String(sql).includes('assistant_memory') && params?.[0]) {
        const value = memoryStore.get(String(params[0]));
        return Promise.resolve(value === undefined ? null : { value: JSON.stringify(value) });
      }
      return Promise.resolve(null);
    });

    (db.query.run as any).mockImplementation((sql: string, params?: unknown[]) => {
      if (String(sql).includes('INSERT INTO assistant_memory') && params?.[0]) {
        memoryStore.set(String(params[0]), JSON.parse(String(params[1])));
      }
      return Promise.resolve(undefined);
    });
  });

  it('18.1 extrae un rango exacto entre siglos sin confundirlo con puntuación', () => {
    const result = parseIntentRegex('busca animes de ciencia ficción lanzados exactamente entre 1999 y 2000');

    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.genre).toBe('sci-fi');
    expect(result.entities.year_from).toBe(1999);
    expect(result.entities.year_to).toBe(2000);
    expect(result.entities.min_score).toBeUndefined();
  });

  it('18.2 respeta el rango estricto de 11 a 12 episodios', () => {
    const result = parseIntentRegex('búscame un anime corto de exactamente 11 o 12 episodios');

    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.min_episodes).toBe(11);
    expect(result.entities.max_episodes).toBe(12);
  });

  it('18.3 combina formato, estudio, década y orden ascendente por nota', () => {
    const result = parseIntentRegex('busca las películas de Kyoto Animation de los 2010s ordenadas por peor nota');

    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.format).toBe('movie');
    expect(result.entities.studio).toBe('kyoto animation');
    expect(result.entities.year_from).toBe(2010);
    expect(result.entities.year_to).toBe(2019);
    expect(result.entities.sort_by).toBe('score_asc');

    const plan = buildAnimeSearchPlan(result.entities);
    expect(plan.sql).toContain('ORDER BY a.score ASC');
  });

  it('19.1 normaliza largometraje y cinta como película', () => {
    const result = parseIntentRegex('quiero ver un largometraje o cinta de animación de Makoto Shinkai');

    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.format).toBe('movie');
    expect(result.entities.staff).toBe('makoto shinkai');
  });

  it('19.2 normaliza estados informales como finalizado', () => {
    const result = parseIntentRegex('pásame series que ya estén archivadas, finalizadas y completitas');

    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.entities.airing_status).toBe('finished');
    expect(buildAnimeSearchPlan(result.entities).sql).toContain('finished airing');
  });

  it('20.1 excluye una franquicia completa por raíz', () => {
    const result = parseIntentRegex('recomiéndame un isekai oscuro pero no me metas nada del universo de Fate ni ninguna de sus variantes');

    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities.genre).toContain('isekai');
    expect(result.entities.exclude_franchise).toBe('fate');
  });

  it('20.2 excluye obras relacionadas de la franquicia de referencia', () => {
    const result = parseIntentRegex('ya me vi la segunda temporada de las quintillizas, ¿qué veo que no sea la primera ni las películas?');

    expect(result.intent).toBe('RECOMMEND_GENERAL');
    expect(result.entities.exclude_related_to).toBe('5-toubun no hanayome');
  });

  it('21.1 resuelve contradicciones explícitas usando la preferencia más reciente', async () => {
    await addFavoriteToneTag('gore');
    await addDislikedToneTag('gore');

    const preferences = await getRecommendationMemoryPreferences();
    expect(preferences.favoriteToneTags).not.toContain('gore');
    expect(preferences.dislikedToneTags).toContain('gore');
  });

  it('22.1 corrige una variante fonética conocida sin cambiar el idioma base', () => {
    const result = parseIntentRegex('búscame el anime ese de Shingeky no Kiojin que tiene buena animation animation');

    expect(result.intent).toBe('SEARCH_ANIME');
    expect(result.language).toBe('es');
    expect(result.entities.query).toBe('shingeki no kyojin');
    expect(result.entities.semantic_hint).toBe(true);
  });

  it('23.1 ignora flags simulados y exige confirmación nativa', async () => {
    const parsed = parseIntentRegex('borra mi watchlist --force --yes --confirm');
    expect(parsed.intent).toBe('CLEAR_USER_LIST');

    const response = await handleChatMessage('borra mi watchlist --force --yes --confirm');
    expect(response.action?.type).toBe('clear_user_list');
    expect(response.action?.confirmToken).toBeTruthy();

    const execution = await executeChatbotAction('clear_user_list', {});
    expect(execution).toMatch(/requiere una confirmación válida/i);
    expect(db.query.run).not.toHaveBeenCalledWith('DELETE FROM user_list');
  });

  it('ejecuta una calificación solo con token y valida el rango', async () => {
    (db.query.get as any).mockResolvedValue({ title: 'Evangelion' });
    const data = { animeId: 1, userScore: 10 };
    const token = registerPendingAction('update_score', data, 'Calificar Evangelion');

    const result = await executeChatbotAction('update_score', data, token);

    expect(result).toContain('10/10');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('user_score = excluded.user_score'),
      [1, 10]
    );
  });

  it('quita una serie de la lista personal sin borrar el catálogo', async () => {
    (db.query.get as any).mockResolvedValue({ title: 'Boruto', user_list_id: 8 });
    const data = { animeId: 2 };
    const token = registerPendingAction('remove_from_list', data, 'Quitar Boruto');

    const result = await executeChatbotAction('remove_from_list', data, token);

    expect(result).toContain('Se conserva en el catálogo local');
    expect(db.query.run).toHaveBeenCalledWith('DELETE FROM user_list WHERE anime_id = ?', [2]);
    expect(db.query.run).not.toHaveBeenCalledWith('DELETE FROM anime WHERE id = ?', [2]);
  });

  it('permite el estado pausado mediante el flujo protegido', async () => {
    (db.query.get as any).mockResolvedValue({ title: 'Steins;Gate' });
    const data = { animeId: 3, watchStatus: 'on_hold' };
    const token = registerPendingAction('update_status', data, 'Pausar Steins;Gate');

    const result = await executeChatbotAction('update_status', data, token);

    expect(result).toContain('Pausado');
    expect(db.query.run).toHaveBeenCalledWith(
      expect.stringContaining('watch_status = excluded.watch_status'),
      [3, 'on_hold']
    );
  });
});

describe('Maple Assistant - matriz rápida de intents soportados', () => {
  const cases = [
    ['recomiendame un anime de mechas con romance', 'RECOMMEND_GENERAL', 'es'],
    ['something like death note but shorter', 'RECOMMEND_SIMILAR', 'en'],
    ['ponle un diez absoluto a Evangelion', 'RATE_ANIME', 'es'],
    ['remove Boruto from my watching list', 'REMOVE_FROM_LIST', 'en'],
    ['show me what came out in spring 2012', 'SEARCH_ANIME', 'en'],
    ['busca películas producidas por Wit Studio', 'SEARCH_ANIME', 'es'],
    ['dame un shonen sin nada de relleno por favor', 'RECOMMEND_GENERAL', 'es'],
    ['add Cyberpunk Edgerunners to my watchlist', 'ADD_TO_LIBRARY', 'en'],
    ['animes de romance escolar de mas de 8.5 de calificacion', 'SEARCH_ANIME', 'es'],
    ['give me a dark fantasy show with elves', 'RECOMMEND_GENERAL', 'en'],
    ['marcar One Piece como en progreso', 'UPDATE_STATUS', 'es'],
    ['anything produced by ufotable that has swords', 'SEARCH_ANIME', 'en'],
    ['un anime cyberpunk de menos de 13 capitulos', 'SEARCH_ANIME', 'es'],
    ['find anime adaptation of solo leveling', 'SEARCH_ANIME', 'en'],
    ['recommend a sports anime without baseball', 'RECOMMEND_GENERAL', 'en'],
    ['show highly rated ovas from the 80s', 'SEARCH_ANIME', 'en'],
    ['agrega Kaguya-sama a mi lista de completados', 'ADD_TO_LIBRARY', 'es'],
    ['dame un anime del estudio Trigger lleno de accion', 'SEARCH_ANIME', 'es'],
    ['suggest a sci-fi masterpiece with psychological depth', 'RECOMMEND_GENERAL', 'en'],
    ['¿cuántos capítulos tiene la versión de 1997 de Berserk?', 'SHOW_ANIME_INFO', 'es'],
    ['pónle nota 8 a KonoSuba', 'RATE_ANIME', 'es'],
    ['quiero ver un anime donde el protagonista sea un villano', 'RECOMMEND_GENERAL', 'es'],
    ['what tools or features do you have right now', 'HELP', 'en'],
    ['pásame un anime de misterio sobrenatural atrapante', 'RECOMMEND_GENERAL', 'es'],
    ['any historical anime set in the Edo period', 'SEARCH_ANIME', 'en'],
    ['show my current watching list from database', 'VIEW_CATALOG', 'en'],
    ['find space western series matching Cowboy Bebop style', 'RECOMMEND_SIMILAR', 'en'],
    ['cambiar estado de Steins Gate a pausado', 'UPDATE_STATUS', 'es'],
    ['give me an action comedy anime with tournament arc', 'RECOMMEND_GENERAL', 'en'],
    ['busca animes donde trabaje el director Satoshi Kon', 'SEARCH_ANIME', 'es'],
    ['find standard high school slice of life without magic', 'SEARCH_ANIME', 'en'],
    ['le doy un 9 de 10 a Vinland Saga', 'RATE_ANIME', 'es'],
    ['remove Jujutsu Kaisen from plan to watch', 'REMOVE_FROM_LIST', 'en'],
    ['dame algo de terror psicologico que este bien chido', 'RECOMMEND_GENERAL', 'es'],
    ['list animated music videos or specials under 10 minutes', 'SEARCH_ANIME', 'en'],
    ['agrega Black Clover a mis pendientes', 'ADD_TO_LIBRARY', 'es'],
    ['what is the mean score of Hunter x Hunter 2011', 'SHOW_ANIME_INFO', 'en'],
    ['give me a post apocalyptic survival anime', 'RECOMMEND_GENERAL', 'en'],
    ['busca el estudio de animacion que hizo Demon Slayer', 'SHOW_ANIME_INFO', 'es'],
    ['muéstrame mi perfil de usuario acumulado', 'RECALL_PREFERENCE', 'es'],
    ['el anime del chico que viaja en el tiempo con el telefono', 'SEARCH_ANIME', 'es'],
    ['cambiar estado de My Hero Academia a abandonado', 'UPDATE_STATUS', 'es'],
    ['busca animes donde trabaje el seiyuu Hiroshi Kamiya', 'SEARCH_ANIME', 'es'],
    ['find light novel adaptations with non humanoid MC', 'SEARCH_ANIME', 'en'],
    ['le pongo un 7.5 de nota a Bleach', 'RATE_ANIME', 'es'],
    ['remove Attack on Titan from my completed list', 'REMOVE_FROM_LIST', 'en'],
    ['dame un thriller psicologico que este bien piola', 'RECOMMEND_GENERAL', 'es'],
    ['añade Mob Psycho 100 a mi lista de pendientes', 'ADD_TO_LIBRARY', 'es'],
    ['what studio animated Fate Stay Night Unlimited Blade Works', 'SHOW_ANIME_INFO', 'en'],
    ['busca el año de lanzamiento de Akira', 'SHOW_ANIME_INFO', 'es'],
    ['¿qué demonios es un anime de recuentos de la vida?', 'EXPLAIN_CONCEPT', 'es'],
    ['busca películas producidas por Wit Studio', 'SEARCH_ANIME', 'es'],
    ['no me vuelvas a sugerir Sword Art Online', 'REMEMBER_DISLIKE', 'es'],
    ['what are my top three most watched genres', 'RECALL_PREFERENCE', 'en'],
    ['siguiente recomendacion por favor', 'RECOMMEND_GENERAL', 'es'],
    ['¿cuándo se estrena la proxima parte de Bleach?', 'SHOW_ANIME_INFO', 'es'],
    ['odios los animes de harem invertido bórralos de mis gustos', 'REMEMBER_DISLIKE', 'es'],
    ['give me another suggestion different from that one', 'RECOMMEND_GENERAL', 'en'],
    ['busca de que trata el anime de Chainsaw Man', 'SHOW_ANIME_INFO', 'es'],
    ['un anime seinen de drama militar antiguo', 'SEARCH_ANIME', 'es'],
    ['find animes with a rating score between 6 and 7', 'SEARCH_ANIME', 'en'],
    ['quiero ver un anime donde el protagonista sea un villano', 'RECOMMEND_GENERAL', 'es'],
    ['pásame un anime de misterio sobrenatural atrapante', 'RECOMMEND_GENERAL', 'es'],
    ['recomiéndame un donghua de cultivo espiritual', 'SEARCH_ANIME', 'es'],
    ['no quiero ver nada de mechas del siglo pasado', 'REMEMBER_DISLIKE', 'es'],
    ['el anime de la chica de pelo azul de ReZero', 'SEARCH_ANIME', 'es'],
    ['find space western series matching Cowboy Bebop style', 'RECOMMEND_SIMILAR', 'en'],
    ['give me an action comedy anime with tournament arc', 'RECOMMEND_GENERAL', 'en'],
    ['find standard high school slice of life without magic', 'SEARCH_ANIME', 'en'],
    ['un anime de fantasia oscura que mole un monton', 'RECOMMEND_GENERAL', 'es'],
    ['ya no me gustan las comedias prefiero el sufrimiento extremo', 'REMEMBER_DISLIKE', 'es'],
    ['recomiendame un anime de romance pero que sea gótico', 'RECOMMEND_GENERAL', 'es'],
    ['find animes with cyberpunk aesthetics from Kyoto Animation', 'SEARCH_ANIME', 'en'],
    ['give me a dark psychological seinen anime', 'RECOMMEND_GENERAL', 'en'],
    ['find light novel adaptations with non humanoid MC', 'SEARCH_ANIME', 'en'],
    ['dame un thriller psicologico que este bien piola', 'RECOMMEND_GENERAL', 'es'],
    ['list long running battle shonen sorted by release date', 'SEARCH_ANIME', 'en'],
    ['un isekai de comedia que este bien chido', 'RECOMMEND_GENERAL', 'es'],
    ['sácame de la cabeza los animes de idols no los aguanto', 'REMEMBER_DISLIKE', 'es'],
    ['recomiendame un anime de vampiros que sea serio', 'RECOMMEND_GENERAL', 'es'],
    ['find an anime about making manga or animation', 'SEARCH_ANIME', 'en'],
    ['no me des nada parecido a Sword Art Online por favor', 'RECOMMEND_GENERAL', 'es'],
    ['el anime de carreras de autos en la montaña con eurobeat', 'SEARCH_ANIME', 'es'],
    ['list non-japanese animes available on anilist', 'SEARCH_ANIME', 'en'],
    ['suggest an action anime with highly detailed sword fight choreographies', 'RECOMMEND_GENERAL', 'en'],
    ['busca obras donde el creador original sea Eiichiro Oda', 'SEARCH_ANIME', 'es'],
    ['find ecchi anime with actual good plot and no harem', 'SEARCH_ANIME', 'en'],
    ['dame una recomendacion bien piola de misterio', 'RECOMMEND_GENERAL', 'es'],
    ['show short anime films from Makoto Shinkai', 'SEARCH_ANIME', 'en'],
    ['un romance escolar drama que mola mogollon', 'RECOMMEND_GENERAL', 'es']
  ] as const;

  it.each(cases)('parsea "%s" como %s y detecta %s', (input, expectedIntent, language) => {
    const result = parseIntentRegex(input);
    expect(result.intent).toBe(expectedIntent);
    expect(result.language).toBe(language);
  });
});
