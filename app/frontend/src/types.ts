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

export interface ScrapingJobStatus {
  jobId: string | null;
  jobType: 'massive' | 'season' | null;
  state: 'idle' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
  startYear: number | null;
  endYear: number | null;
  currentYear: number | null;
  currentSeason: string | null;
  completedSeasons: number;
  totalSeasons: number;
  successfulSeasons: number;
  failedSeasons: number;
  totalImported: number;
  retryCount: number;
  requestDelayMs: number;
  progressPercent: number;
  message: string;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
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

export interface ChatActionExecutionResponse {
  text: string;
}

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

export interface MangaItem {
  id: number;
  external_id?: number | string | null;
  mal_id?: number | null;
  source?: string | null;
  title: string;
  title_romaji?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  synopsis?: string | null;
  year?: number | null;
  status?: string | null;
  format?: string | null;
  chapters?: number | null;
  volumes?: number | null;
  score?: number | null;
  popularity?: number | null;
  cover_image?: string | null;
  banner_image?: string | null;
  author?: string | null;
  artist?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  official_url?: string | null;
  genres?: string[];
  read_status?: 'reading' | 'plan_to_read' | 'completed' | 'dropped' | 'on_hold' | string | null;
  favorite?: number | null;
  user_score?: number | null;
  chapters_read?: number | null;
  volumes_read?: number | null;
  notes?: string | null;
}

export interface MangaSourceOverview {
  policy: string;
  providers: MangaOnlineProvider[];
  configured: Array<{
    id: number;
    name: string;
    base_url: string;
    language: string;
    type: string;
    enabled: number;
    risk_level: string;
    rate_limit: number;
    last_sync?: string | null;
  }>;
  candidates: Array<{
    id: string;
    name: string;
    url: string;
    languages: string[];
    use: string[];
    risk: string;
    enabledByDefault: boolean;
    notes: string;
  }>;
}

export interface MangaOnlineProvider {
  id: 'mangadex' | 'zonatmo' | 'shademanga' | string;
  label: string;
  baseUrl: string;
  languages: string[];
  status: 'active';
  enabled: boolean;
  notes: string;
}

export interface MangaOnlineSearchItem {
  id: string;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  synopsis?: string;
  status?: string;
  year?: number;
  contentRating?: string;
  coverUrl?: string;
  sourceUrl: string;
  genres?: string[];
  tags?: string[];
  translation?: {
    translated: boolean;
    cached?: boolean;
    status?: string;
  };
}

export interface MangaLibrarySavePayload {
  source: string;
  externalId: string;
  title: string;
  titleRomaji?: string;
  titleEnglish?: string;
  synopsis?: string;
  year?: number;
  status?: string;
  coverUrl?: string;
  sourceUrl?: string;
  genres?: string[];
  chapters?: MangaOnlineChapter[];
}

export interface MangaOnlineTag {
  id: string;
  name: string;
  group: 'genre' | 'theme' | 'format' | 'other';
}

export interface MangaOnlineChapter {
  id: string;
  number?: number;
  volume?: string;
  title?: string;
  language: 'es' | 'en';
  group?: string;
  publishedAt?: string;
  sourceUrl: string;
}

export interface MangaOnlinePages {
  chapterId: string;
  quality: 'data' | 'data-saver';
  pages: string[];
  totalPages?: number;
}

export interface AgentSystemOverview {
  product: string;
  mode: string;
  leadAgent: {
    id: string;
    label: string;
    purpose: string;
  };
  tokenReductionPolicy: string[];
  subagents: Array<{
    id: string;
    label: string;
    purpose: string;
    scope: string[];
    riskLevel: string;
    tokenStrategy: string[];
    guardrails: string[];
  }>;
}

export interface RecommendedAnimeSourceIntegration {
  id: string;
  name: string;
  referenceUrl: string;
  repository?: string;
  languages: string[];
  languageLabel: string;
  category: 'local-media-server' | 'local-bridge' | 'private-cloud' | 'community-stream' | 'torrent-index';
  transports: Array<'https-embed' | 'direct-mp4' | 'hls' | 'torrent' | 'local-file'>;
  playerSupport: 'supported' | 'partial' | 'unsupported';
  integrationStatus: 'planned' | 'research-only';
  risk: 'low' | 'medium' | 'high';
  enabledByDefault: false;
  requiresExternalService: boolean;
  recommendation: string;
}

export interface SourceCandidatesOverview {
  policy: string;
  playerCapabilities: {
    httpsEmbed: 'supported' | 'partial' | 'unsupported';
    directMp4: 'supported' | 'partial' | 'unsupported';
    hls: 'supported' | 'partial' | 'unsupported';
    torrent: 'supported' | 'partial' | 'unsupported';
    note: string;
  };
  selected: RecommendedAnimeSourceIntegration[];
  candidates: MangaSourceOverview['candidates'];
}
