export interface Anime {
  id: number;
  external_id?: number;
  source?: string;
  title: string;
  title_romaji?: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  synopsis_original?: string;
  synopsis_es?: string;
  year?: number;
  season?: string;
  status?: 'finished' | 'airing' | 'upcoming' | 'cancelled' | 'unknown';
  type?: 'tv' | 'movie' | 'ova' | 'ona' | 'special';
  episodes?: number;
  duration?: number;
  score?: number;
  popularity?: number;
  cover_image?: string;
  banner_image?: string;
  studio?: string;
  source_material?: string;
  age_rating?: string;
  start_date?: string;
  end_date?: string;
  official_url?: string;
  created_at?: string;
  updated_at?: string;
  genres?: string[];
  genres_es?: string[];
  status_label_es?: string;
  type_label_es?: string;
  translation?: {
    provider?: string;
    synopsisStatus?: string;
    synopsisTranslated?: boolean;
    synopsisCached?: boolean;
  };

  // Campos mezclados del user_list si está en la lista
  watch_status?: 'watching' | 'plan_to_watch' | 'completed' | 'dropped' | 'on_hold';
  favorite?: number;
  user_score?: number;
  episodes_watched?: number;
  notes?: string;
}

export interface UserListItem {
  id: number;
  anime_id: number;
  watch_status: 'watching' | 'plan_to_watch' | 'completed' | 'dropped' | 'on_hold';
  favorite: number; // 0 o 1
  user_score: number;
  episodes_watched: number;
  notes?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;

  // Detalles del anime unidos en la consulta
  title: string;
  title_romaji?: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  synopsis_original?: string;
  synopsis_es?: string;
  genres?: string[];
  genres_es?: string[];
  status?: string;
  type?: string;
  duration?: number;
  banner_image?: string;
  status_label_es?: string;
  type_label_es?: string;
  cover_image?: string;
  studio?: string;
  year?: number;
  season?: string;
  episodes?: number;
  mal_score?: number;
}

export interface ScrapingSource {
  id: number;
  name: string;
  base_url: string;
  type: 'api' | 'scraping';
  enabled: number; // 0 o 1
  rate_limit: number;
  last_sync?: string;
}

export interface ScrapingLog {
  id: number;
  source: string;
  action: string;
  status: 'started' | 'success' | 'error';
  message: string;
  created_at: string;
}

export interface DatabaseBackup {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export type ChatActionType =
  | 'add_anime'
  | 'resolve_duplicates'
  | 'update_status'
  | 'update_score'
  | 'remove_from_list'
  | 'clear_user_list'
  | 'mark_watched'
  | 'mark_all_watched'
  | 'batch_update_status'
  | 'delete_anime'
  | 'sync_all';

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  visualData?: {
    type: string;
    data: any;
  };
  action?: {
    type: ChatActionType;
    data: any;
    confirmMessage: string;
    confirmToken?: string;
  };
}

export interface ChatCapabilityAction {
  type: ChatActionType | string;
  description: string;
  requiresConfirmation: boolean;
}

export interface ChatCapabilityIntent {
  id: string;
  internalIntent: string;
  category: string;
  description: string;
  example: string;
  entities: readonly string[] | string[];
  requiresConfirmation: boolean;
}

export interface ChatCapabilities {
  assistant: {
    name: string;
    product: string;
    executionMode: string;
    defaultNlp: string;
    optionalNlp: string;
    personality?: string;
    dataPolicy?: string;
  };
  categories: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  intents: ChatCapabilityIntent[];
  supportedIntents: string[];
  actions: ChatCapabilityAction[];
  safetyPolicy: {
    inputSanitization: boolean;
    outputSanitization: boolean;
    writeActionsRequireToken: boolean;
    actionAllowList: boolean;
    persistentSearchContextTtlMinutes?: number;
    auditTrail: string;
  };
  examples: string[];
  featuredPrompts: Array<{
    id: string;
    title: string;
    prompt: string;
    intent: string;
  }>;
  continuousImprovement: string[];
  endpoints: Record<string, string>;
}

export interface ChatActionHistoryItem {
  id: number;
  user_prompt: string;
  detected_intent: string;
  nlp_engine: string;
  selected_tool: string;
  requires_confirmation: number;
  execution_status: 'SUCCESS' | 'REJECTED' | 'ERROR' | string;
  latency_ms: number;
  error_message?: string | null;
  created_at: string;
}

export interface Settings {
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
}
