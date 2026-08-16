import axios from 'axios';

import type {
  ChatActionExecutionResponse,
  ChatActionHistoryItem,
  ChatActionType,
  ChatCapabilities,
  ChatMessage,
  DatabaseBackup,
  AgentSystemOverview,
  MangaItem,
  MangaOnlineChapter,
  MangaOnlinePages,
  MangaOnlineSearchItem,
  MangaOnlineTag,
  MangaSourceOverview,
  SourceCandidatesOverview
} from '../types';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

type DesktopApiConfig = {
  baseUrl?: string;
  token?: string;
};

const desktopApiConfigPromise: Promise<DesktopApiConfig | null> = (
  window as Window & {
    electronAPI?: {
      backend?: {
        getConfig?: () => Promise<DesktopApiConfig>;
      };
    };
  }
).electronAPI?.backend?.getConfig?.()
  .catch(() => null) || Promise.resolve(null);

client.interceptors.request.use(async config => {
  const desktopConfig = await desktopApiConfigPromise;
  if (desktopConfig?.baseUrl) {
    config.baseURL = desktopConfig.baseUrl;
  }
  if (desktopConfig?.token) {
    config.headers.set('X-MapleVault-Token', desktopConfig.token);
  }
  return config;
});

export const api = {
  // Animes (Catálogo)
  getAnimeList: async (filters: {
    q?: string;
    year?: string | number;
    season?: string;
    genre?: string;
    status?: string;
    type?: string;
    score?: string | number;
    sort?: string;
    adult?: string;
    limit?: number;
    offset?: number;
    withTotal?: boolean;
    translateSynopsis?: boolean;
    includeSynopsis?: boolean;
  } = {}) => {
    const response = await client.get('/anime', { params: filters });
    return response.data;
  },

  getAnimeListPage: async (filters: {
    q?: string;
    year?: string | number;
    season?: string;
    genre?: string;
    status?: string;
    type?: string;
    score?: string | number;
    sort?: string;
    adult?: string;
    limit: number;
    offset: number;
    translateSynopsis?: boolean;
    includeSynopsis?: boolean;
  }) => {
    const response = await client.get('/anime', {
      params: { ...filters, withTotal: true }
    });
    return response.data as {
      items: any[];
      total: number;
      limit: number;
      offset: number;
    };
  },

  getDashboardSummary: async () => {
    const response = await client.get('/dashboard/summary');
    return response.data;
  },

  getSeasonSummary: async () => {
    const response = await client.get('/seasons/summary');
    return response.data;
  },

  getAnimeDetail: async (id: number) => {
    const response = await client.get(`/anime/${id}`);
    return response.data;
  },

  createAnime: async (animeData: any) => {
    const response = await client.post('/anime', animeData);
    return response.data;
  },

  importAnime: async (animeData: any) => {
    const response = await client.post('/anime/import', animeData);
    return response.data;
  },

  updateAnime: async (id: number, animeData: any) => {
    const response = await client.put(`/anime/${id}`, animeData);
    return response.data;
  },

  deleteAnime: async (id: number) => {
    const response = await client.delete(`/anime/${id}`);
    return response.data;
  },

  getGenres: async () => {
    const response = await client.get('/genres');
    return response.data;
  },

  // Lista de Usuario
  getUserList: async (filters: { status?: string; favorite?: number } = {}) => {
    const response = await client.get('/user-list', { params: filters });
    return response.data;
  },

  addToUserList: async (data: {
    anime_id: number;
    watch_status: string;
    favorite?: number;
    user_score?: number;
    episodes_watched?: number;
    notes?: string;
  }) => {
    const response = await client.post('/user-list', data);
    return response.data;
  },

  updateUserList: async (id: number, data: {
    watch_status: string;
    favorite?: number;
    user_score?: number;
    episodes_watched?: number;
    notes?: string;
    completed_at?: string | null;
  }) => {
    const response = await client.put(`/user-list/${id}`, data);
    return response.data;
  },

  removeFromUserList: async (id: number) => {
    const response = await client.delete(`/user-list/${id}`);
    return response.data;
  },

  // Recomendaciones
  getRecommendations: async () => {
    const response = await client.get('/recommendations');
    return response.data;
  },

  // Scraping y Búsqueda Externa
  searchExternal: async (q: string) => {
    const response = await client.get('/search', { params: { q } });
    return response.data;
  },

  syncSeason: async (year: number, season: string) => {
    const response = await client.post('/scraping/sync-season', { year, season });
    return response.data;
  },

  syncYears: async (startYear: number) => {
    const response = await client.post('/scraping/sync-years', { startYear });
    return response.data;
  },

  getScrapingLogs: async () => {
    const response = await client.get('/scraping/logs');
    return response.data;
  },

  getScrapingStatus: async () => {
    const response = await client.get('/scraping/status');
    return response.data;
  },

  getScrapingSources: async () => {
    const response = await client.get('/scraping/sources');
    return response.data;
  },

  updateScrapingSource: async (id: number, data: { enabled: boolean; rate_limit: number }) => {
    const response = await client.put(`/scraping/sources/${id}`, data);
    return response.data;
  },

  // Manga: preparado sin scraping activo por defecto
  getMangaListPage: async (filters: {
    q?: string;
    status?: string;
    format?: string;
    sort?: string;
    limit: number;
    offset: number;
  }) => {
    const response = await client.get('/manga', {
      params: { ...filters, withTotal: true }
    });
    return response.data as {
      rows: MangaItem[];
      total: number;
      limit: number;
      offset: number;
    };
  },

  getMangaDetail: async (id: number): Promise<MangaItem> => {
    const response = await client.get(`/manga/${id}`);
    return response.data;
  },

  getMangaSources: async (): Promise<MangaSourceOverview> => {
    const response = await client.get('/manga/sources');
    return response.data;
  },

  searchMangaOnline: async (q: string, limit = 20, source = 'mangadex', filters?: { genres?: string[]; tags?: string[]; status?: string }): Promise<{ results: MangaOnlineSearchItem[] }> => {
    const response = await client.get('/manga/online/search', { params: {
      q, limit, source,
      genres: filters?.genres?.join(','),
      tags: filters?.tags?.join(','),
      status: filters?.status
    } });
    return response.data;
  },

  getMangaOnlineRecent: async (limit = 8, source = 'mangadex'): Promise<{ results: MangaOnlineSearchItem[]; supported: boolean }> => {
    const response = await client.get('/manga/online/recent', { params: { limit, source } });
    return response.data;
  },

  getMangaOnlineTags: async (source = 'mangadex'): Promise<{ tags: MangaOnlineTag[]; supported: boolean }> => {
    const response = await client.get('/manga/online/tags', { params: { source } });
    return response.data;
  },

  getMangaOnlineDetails: async (
    mangaId: string,
    source = 'mangadex'
  ): Promise<{ manga: MangaOnlineSearchItem }> => {
    const response = await client.get(`/manga/online/${encodeURIComponent(mangaId)}/details`, {
      params: { source }
    });
    return response.data;
  },

  getMangaOnlineChapters: async (
    mangaId: string,
    languages: Array<'es' | 'en'> = ['es', 'en'],
    source = 'mangadex'
  ): Promise<{ chapters: MangaOnlineChapter[] }> => {
    const response = await client.get(`/manga/online/${encodeURIComponent(mangaId)}/chapters`, {
      params: { languages: languages.join(','), source }
    });
    return response.data;
  },

  getMangaOnlinePages: async (
    chapterId: string,
    quality: 'data' | 'data-saver' = 'data-saver',
    source = 'mangadex'
  ): Promise<MangaOnlinePages> => {
    const response = await client.get(`/manga/online/chapters/${encodeURIComponent(chapterId)}/pages`, {
      params: { quality, source }
    });
    return response.data;
  },

  downloadMangaOnlineChapter: async (
    chapterId: string,
    series: string,
    chapter: string,
    quality: 'data' | 'data-saver' = 'data-saver',
    source = 'mangadex'
  ): Promise<Blob> => {
    const response = await client.get(`/manga/online/chapters/${encodeURIComponent(chapterId)}/download`, {
      params: { quality, series, chapter, source },
      responseType: 'blob'
    });
    return response.data as Blob;
  },

  // Chatbot Maple Assistant
  getChatCapabilities: async (): Promise<ChatCapabilities> => {
    const response = await client.get('/chat/capabilities');
    return response.data;
  },

  sendChatMessage: async (message: string) => {
    const response = await client.post('/chat/message', { message });
    return response.data;
  },

  executeChatAction: async (
    type: ChatActionType,
    data: Record<string, unknown>,
    confirmToken?: string
  ): Promise<ChatActionExecutionResponse> => {
    const response = await client.post('/chat/execute-action', { type, data, confirmToken });
    return response.data;
  },

  getChatHistory: async (): Promise<ChatMessage[]> => {
    const response = await client.get('/chat/history');
    return response.data;
  },

  clearChatHistory: async () => {
    const response = await client.delete('/chat/history');
    return response.data;
  },

  clearBotMemory: async () => {
    const response = await client.delete('/chat/memory');
    return response.data;
  },

  getBotMemoryProfile: async () => {
    const response = await client.get('/chat/memory/profile');
    return response.data;
  },

  generateBotMemoryProfile: async () => {
    const response = await client.post('/chat/memory/profile');
    return response.data;
  },

  getChatActionHistory: async (): Promise<ChatActionHistoryItem[]> => {
    const response = await client.get('/chat/actions/history');
    return response.data;
  },

  // AI Settings
  getAISettings: async () => {
    const response = await client.get('/settings/ai');
    return response.data;
  },
  
  setAISettings: async (settings: any) => {
    const response = await client.post('/settings/ai', settings);
    return response.data;
  },
  
  resetAISettings: async () => {
    const response = await client.delete('/settings/ai');
    return response.data;
  },

  seedAIMemory: async () => {
    const response = await client.post('/settings/ai/seed');
    return response.data;
  },
  
  testAIConnection: async (data: { url: string, provider: string, model: string }) => {
    const response = await client.post('/settings/ai/test', data);
    return response.data;
  },

  // Ajustes, Importación/Exportación
  getSettings: async () => {
    const response = await client.get('/settings');
    return response.data;
  },

  saveSettings: async (settingsData: {
    theme: 'dark';
    language: 'es';
    closeBehavior?: 'ask' | 'minimize' | 'quit';
    translation?: {
      enabled: boolean;
      autoStart: boolean;
      provider: 'libretranslate';
      url: string;
      apiKey?: string;
      timeoutMs: number;
      cacheEnabled: boolean;
      translateSynopsis: boolean;
      translateGenres: boolean;
      translateStatuses: boolean;
    };
  }) => {
    const response = await client.post('/settings', settingsData);
    return response.data;
  },

  saveCloseBehavior: async (closeBehavior: 'ask' | 'minimize' | 'quit') => {
    const response = await client.patch('/settings/window', { closeBehavior });
    return response.data;
  },

  exportData: async () => {
    const response = await client.post('/settings/export');
    return response.data;
  },

  importData: async (importJson: any) => {
    const response = await client.post('/settings/import', importJson);
    return response.data;
  },

  createBackup: async () => {
    const response = await client.post('/settings/backup');
    return response.data;
  },

  listDatabaseBackups: async (): Promise<DatabaseBackup[]> => {
    const response = await client.get('/backup/list');
    return response.data;
  },

  restoreDatabaseBackup: async (backupPath: string) => {
    const response = await client.post('/backup/restore', { backupPath });
    return response.data;
  },

  getAgentSystem: async (): Promise<AgentSystemOverview> => {
    const response = await client.get('/system/agents');
    return response.data;
  },

  getSourceCandidates: async (): Promise<SourceCandidatesOverview> => {
    const response = await client.get('/system/source-candidates');
    return response.data;
  },

  getSystemHealth: async () => {
    const response = await client.get('/system/health');
    return response.data;
  },

  getSystemDiagnostics: async () => {
    const response = await client.get('/system/diagnostics');
    return response.data;
  },

  getTranslationStatus: async () => {
    const response = await client.get('/translation/status');
    return response.data;
  },

  getTranslationInstallStatus: async () => {
    const response = await client.get('/translation/install/status');
    return response.data;
  },

  installLibreTranslate: async () => {
    const response = await client.post('/translation/install');
    return response.data;
  },

  getDuplicatePreview: async () => {
    const response = await client.get('/maintenance/duplicates');
    return response.data;
  },

  // Episodios y Reproductores (AnimeAV1)
  getAnimeEpisodes: async (id: number) => {
    const response = await client.get(`/anime/${id}/episodes`);
    return response.data;
  },

  getEpisodeEmbeds: async (id: number, number: number) => {
    const response = await client.get(`/anime/${id}/episodes/${number}`);
    return response.data;
  },

  getWatchedEpisodes: async (animeId: number): Promise<number[]> => {
    const response = await client.get(`/anime/${animeId}/watched-episodes`);
    return response.data;
  },

  toggleEpisodeWatch: async (animeId: number, episodeNumber: number, watched: boolean) => {
    const response = await client.post(`/anime/${animeId}/episodes/${episodeNumber}/watch`, { watched });
    return response.data;
  },

  // TioAnime - fuente alternativa de episodios
  getTioAnimeEpisodes: async (animeId: number) => {
    const response = await client.get(`/tioanime/${animeId}/episodes`);
    return response.data;
  },

  getTioAnimeServers: async (animeId: number, episodeNumber: number) => {
    const response = await client.get(`/tioanime/${animeId}/episodes/${episodeNumber}/servers`);
    return response.data;
  },

  // Limpiar catálogo
  clearCatalog: async (keepUserList: boolean) => {
    const response = await client.post('/anime/clear', { keepUserList });
    return response.data;
  },

  // Relaciones de anime (precuelas y secuelas)
  getAnimeRelations: async (id: number) => {
    const response = await client.get(`/anime/${id}/relations`);
    return response.data;
  },

  getAniListAnimeById: async (externalId: number) => {
    const response = await client.get(`/anime/external/anilist/${externalId}`);
    return response.data;
  },

  // JKAnime
  getJKAnimeEpisodes: async (id: number) => {
    const response = await client.get(`/jkanime/${id}/episodes`);
    return response.data;
  },

  getJKAnimeServers: async (id: number, episodeNumber: number) => {
    const response = await client.get(`/jkanime/${id}/episodes/${episodeNumber}/servers`);
    return response.data;
  },

  // AnimeFLV
  getAnimeFLVEpisodes: async (id: number) => {
    const response = await client.get(`/animeflv/${id}/episodes`);
    return response.data;
  },

  getAnimeFLVServers: async (id: number, episodeNumber: number) => {
    const response = await client.get(`/animeflv/${id}/episodes/${episodeNumber}/servers`);
    return response.data;
  },

  getExternalEpisodeSources: async () => {
    const response = await client.get('/episode-sources');
    return response.data;
  },

  getExternalSourceEpisodes: async (providerId: string, animeId: number) => {
    const response = await client.get(`/episode-sources/${providerId}/anime/${animeId}/episodes`);
    return response.data;
  },

  getExternalSourceServers: async (providerId: string, animeId: number, episodeNumber: number) => {
    const response = await client.get(
      `/episode-sources/${providerId}/anime/${animeId}/episodes/${episodeNumber}/servers`
    );
    return response.data;
  },
};

