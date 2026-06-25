export interface ChatbotEvaluationFixture {
  id: string;
  category: 'search' | 'recommendation' | 'memory' | 'protected_action' | 'info' | 'false_positive';
  prompt: string;
  expectedIntent: string;
  expectedEntities?: Record<string, unknown>;
  forbiddenEntities?: string[];
}

export const CHATBOT_EVALUATION_FIXTURES: ChatbotEvaluationFixture[] = [
  {
    id: 'search-title-basic',
    category: 'search',
    prompt: 'busca naruto',
    expectedIntent: 'SEARCH_ANIME',
    expectedEntities: { animeTitle: 'naruto', query: 'naruto' }
  },
  {
    id: 'search-genre-horror',
    category: 'search',
    prompt: 'busca una serie de terror',
    expectedIntent: 'SEARCH_ANIME',
    expectedEntities: { genre: 'horror' },
    forbiddenEntities: ['animeTitle', 'query']
  },
  {
    id: 'search-genre-romantic-comedy',
    category: 'search',
    prompt: 'busca una serie de comedia romantica',
    expectedIntent: 'SEARCH_ANIME',
    expectedEntities: { genre: ['comedy', 'romance'] },
    forbiddenEntities: ['animeTitle', 'query']
  },
  {
    id: 'recommend-fantasy-no-accent',
    category: 'recommendation',
    prompt: 'recomiendame algo de fantasia',
    expectedIntent: 'RECOMMEND_GENERAL',
    expectedEntities: { genre: 'fantasy' }
  },
  {
    id: 'recommend-tone-with-negative-constraint',
    category: 'recommendation',
    prompt: 'quiero algo oscuro sin romance',
    expectedIntent: 'RECOMMEND_GENERAL',
    expectedEntities: { toneTags: ['dark'], dislikedToneTags: ['romance_focus'] },
    forbiddenEntities: ['animeTitle', 'query']
  },
  {
    id: 'recommend-short-comedy',
    category: 'recommendation',
    prompt: 'quiero algo corto de comedia',
    expectedIntent: 'RECOMMEND_GENERAL',
    expectedEntities: { genre: 'comedy', durationPreference: 'short' }
  },
  {
    id: 'memory-dislike-mecha',
    category: 'memory',
    prompt: 'no me recomiendes mecha',
    expectedIntent: 'REMEMBER_DISLIKE',
    expectedEntities: { genre: 'mecha' },
    forbiddenEntities: ['animeTitle', 'refIndexOrTitle']
  },
  {
    id: 'memory-dislike-romance-tone',
    category: 'memory',
    prompt: 'no quiero romance',
    expectedIntent: 'REMEMBER_DISLIKE',
    expectedEntities: { dislikedToneTags: ['romance_focus'] },
    forbiddenEntities: ['genre', 'animeTitle', 'refIndexOrTitle']
  },
  {
    id: 'memory-prefer-dark-tone',
    category: 'memory',
    prompt: 'me gusta algo oscuro',
    expectedIntent: 'REMEMBER_PREFERENCE',
    expectedEntities: { toneTags: ['dark'] },
    forbiddenEntities: ['animeTitle', 'refIndexOrTitle']
  },
  {
    id: 'memory-prefer-short-series',
    category: 'memory',
    prompt: 'prefiero series cortas',
    expectedIntent: 'REMEMBER_PREFERENCE',
    expectedEntities: { durationPreference: 'short' }
  },
  {
    id: 'memory-like-specific-anime',
    category: 'memory',
    prompt: 'me gustó death note',
    expectedIntent: 'REMEMBER_PREFERENCE',
    expectedEntities: { animeTitle: 'death note', refIndexOrTitle: 'death note' }
  },
  {
    id: 'memory-dislike-specific-anime',
    category: 'memory',
    prompt: 'no me interesa frieren',
    expectedIntent: 'REMEMBER_DISLIKE',
    expectedEntities: { animeTitle: 'frieren', refIndexOrTitle: 'frieren' }
  },
  {
    id: 'protected-add-index',
    category: 'protected_action',
    prompt: 'agrega el 2 a pendientes',
    expectedIntent: 'ADD_TO_LIBRARY',
    expectedEntities: { refIndexOrTitle: '2', status: 'plan_to_watch' }
  },
  {
    id: 'protected-delete-title',
    category: 'protected_action',
    prompt: 'elimina death note',
    expectedIntent: 'REMOVE_FROM_LIBRARY',
    expectedEntities: { animeTitle: 'death note', refIndexOrTitle: 'death note' }
  },
  {
    id: 'info-index',
    category: 'info',
    prompt: 'info el 1',
    expectedIntent: 'SHOW_ANIME_INFO',
    expectedEntities: { refIndexOrTitle: '1' }
  },
  {
    id: 'false-positive-plain-title',
    category: 'false_positive',
    prompt: 'naruto',
    expectedIntent: 'UNKNOWN',
    forbiddenEntities: ['animeTitle', 'query']
  },
  {
    id: 'false-positive-delete-search-history',
    category: 'false_positive',
    prompt: 'borra mi busqueda anterior',
    expectedIntent: 'UNKNOWN',
    forbiddenEntities: ['refIndexOrTitle', 'animeTitle']
  }
];
