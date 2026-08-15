export type MediaSourceContent = 'anime' | 'manga' | 'anime-manga' | 'metadata';
export type MediaSourceLanguage = 'es' | 'en' | 'multi' | 'ja';
export type MediaSourceUse = 'metadata' | 'tracker' | 'extension-marketplace' | 'streaming-provider' | 'manga-provider' | 'torrent-provider';
export type MediaSourceRisk = 'low' | 'medium' | 'high';
export type MediaTransport = 'https-embed' | 'direct-mp4' | 'hls' | 'torrent' | 'local-file';
export type MediaPlayerSupport = 'supported' | 'partial' | 'unsupported';
export type MediaIntegrationStatus = 'planned' | 'research-only';

export interface MediaSourceCandidate {
  id: string;
  name: string;
  url: string;
  repository?: string;
  content: MediaSourceContent;
  languages: MediaSourceLanguage[];
  use: MediaSourceUse[];
  risk: MediaSourceRisk;
  enabledByDefault: false;
  notes: string;
}

export interface RecommendedAnimeSourceIntegration {
  id: string;
  name: string;
  referenceUrl: string;
  repository?: string;
  languages: MediaSourceLanguage[];
  languageLabel: string;
  category: 'local-media-server' | 'local-bridge' | 'private-cloud' | 'community-stream' | 'torrent-index';
  transports: MediaTransport[];
  playerSupport: MediaPlayerSupport;
  integrationStatus: MediaIntegrationStatus;
  risk: MediaSourceRisk;
  enabledByDefault: false;
  requiresExternalService: boolean;
  recommendation: string;
}

export const MAPLEVAULT_PLAYER_CAPABILITIES = {
  httpsEmbed: 'supported' as MediaPlayerSupport,
  directMp4: 'partial' as MediaPlayerSupport,
  hls: 'partial' as MediaPlayerSupport,
  torrent: 'unsupported' as MediaPlayerSupport,
  note: 'El reproductor actual abre URLs HTTP/HTTPS aisladas. HLS requiere un adaptador dedicado y los torrents no se ejecutan.'
};

// Shortlist deliberadamente acotada: cinco integraciones nuevas, con un máximo de dos en inglés.
// Ninguna se activa hasta que exista un adaptador probado y una configuración explícita del usuario.
export const RECOMMENDED_ANIME_SOURCE_INTEGRATIONS: RecommendedAnimeSourceIntegration[] = [
  {
    id: 'jellyfin-local',
    name: 'Jellyfin local',
    referenceUrl: 'https://jellyfin.org/docs/',
    repository: 'https://github.com/jellyfin/jellyfin',
    languages: ['multi'],
    languageLabel: 'Multilenguaje',
    category: 'local-media-server',
    transports: ['direct-mp4', 'hls', 'local-file'],
    playerSupport: 'partial',
    integrationStatus: 'planned',
    risk: 'low',
    enabledByDefault: false,
    requiresExternalService: true,
    recommendation: 'Primera integración recomendada: biblioteca controlada por el usuario, API estable y reproducción directa o HLS.'
  },
  {
    id: 'seanime-local-bridge',
    name: 'Seanime local',
    referenceUrl: 'https://github.com/5rahim/seanime',
    repository: 'https://github.com/5rahim/seanime',
    languages: ['multi'],
    languageLabel: 'Multilenguaje',
    category: 'local-bridge',
    transports: ['https-embed', 'direct-mp4', 'hls', 'torrent'],
    playerSupport: 'partial',
    integrationStatus: 'planned',
    risk: 'medium',
    enabledByDefault: false,
    requiresExternalService: true,
    recommendation: 'Usar solo como puente a una instancia local; no cargar extensiones remotas dentro de MapleVault.'
  },
  {
    id: 'google-drive-private',
    name: 'Google Drive privado',
    referenceUrl: 'https://developers.google.com/drive/api/guides/manage-downloads',
    languages: ['multi'],
    languageLabel: 'Multilenguaje',
    category: 'private-cloud',
    transports: ['direct-mp4'],
    playerSupport: 'partial',
    integrationStatus: 'planned',
    risk: 'medium',
    enabledByDefault: false,
    requiresExternalService: true,
    recommendation: 'Adecuado para archivos propios; requiere OAuth, URLs temporales y no exponer credenciales al renderer.'
  },
  {
    id: 'animeheaven-community',
    name: 'AnimeHeaven Community',
    referenceUrl: 'https://github.com/Seanime-contributions/Seanime-Providers/tree/main/src/anime/animeheaven',
    repository: 'https://github.com/Seanime-contributions/Seanime-Providers',
    languages: ['en'],
    languageLabel: 'Inglés',
    category: 'community-stream',
    transports: ['direct-mp4'],
    playerSupport: 'partial',
    integrationStatus: 'research-only',
    risk: 'high',
    enabledByDefault: false,
    requiresExternalService: true,
    recommendation: 'Solo referencia técnica. Dominio, disponibilidad y derechos del contenido deben validarse antes de cualquier adaptador.'
  },
  {
    id: 'nyaa-torrent-index',
    name: 'Nyaa Torrent Index',
    referenceUrl: 'https://nyaa.si',
    repository: 'https://github.com/5rahim/seanime',
    languages: ['en'],
    languageLabel: 'Inglés',
    category: 'torrent-index',
    transports: ['torrent'],
    playerSupport: 'unsupported',
    integrationStatus: 'research-only',
    risk: 'high',
    enabledByDefault: false,
    requiresExternalService: true,
    recommendation: 'No integrar al reproductor actual. Requiere cliente torrent aislado, consentimiento y revisión legal independiente.'
  }
];

export const MEDIA_SOURCE_CANDIDATES: MediaSourceCandidate[] = [
  {
    id: 'anilist',
    name: 'AniList GraphQL',
    url: 'https://graphql.anilist.co',
    content: 'metadata',
    languages: ['multi'],
    use: ['metadata', 'tracker'],
    risk: 'low',
    enabledByDefault: false,
    notes: 'Fuente recomendada para metadata, temporadas, relaciones y futuro soporte de manga.'
  },
  {
    id: 'jikan',
    name: 'Jikan API',
    url: 'https://api.jikan.moe/v4',
    content: 'metadata',
    languages: ['multi'],
    use: ['metadata'],
    risk: 'low',
    enabledByDefault: false,
    notes: 'API pública no oficial de MyAnimeList; útil como fallback con rate limit conservador.'
  },
  {
    id: 'kitsu',
    name: 'Kitsu API',
    url: 'https://kitsu.io/api/edge',
    content: 'metadata',
    languages: ['multi'],
    use: ['metadata', 'tracker'],
    risk: 'low',
    enabledByDefault: false,
    notes: 'Metadata y tracking; útil para enriquecer títulos alternativos y categorías.'
  },
  {
    id: 'mangadex',
    name: 'MangaDex API',
    url: 'https://api.mangadex.org',
    content: 'manga',
    languages: ['multi'],
    use: ['metadata', 'manga-provider'],
    risk: 'medium',
    enabledByDefault: false,
    notes: 'Candidato principal para manga por API pública; requiere manejo de idioma, scanlation y rate limits.'
  },
  {
    id: 'seanime-providers',
    name: 'Seanime Providers',
    url: 'https://github.com/Seanime-contributions/Seanime-Providers',
    repository: 'https://github.com/Seanime-contributions/Seanime-Providers',
    content: 'anime-manga',
    languages: ['multi'],
    use: ['extension-marketplace', 'streaming-provider', 'manga-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Referencia para arquitectura de extensiones; cada proveedor debe auditarse legal y técnicamente por separado.'
  },
  {
    id: 'aniyomi-extensions',
    name: 'Aniyomi extensions ecosystem',
    url: 'https://github.com/aniyomiorg/aniyomi',
    repository: 'https://github.com/aniyomiorg/aniyomi',
    content: 'anime-manga',
    languages: ['multi'],
    use: ['extension-marketplace', 'streaming-provider', 'manga-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Referencia de ecosistema de extensiones; no integrar proveedores sin sandbox, permisos y validación.'
  },
  {
    id: 'torrentio',
    name: 'Torrentio-style provider',
    url: 'https://torrentio.strem.fun',
    content: 'anime',
    languages: ['multi'],
    use: ['torrent-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Solo evaluar como referencia de arquitectura; alto riesgo legal y operativo según contenido consultado.'
  },
  {
    id: 'nyaa',
    name: 'Nyaa-style torrent search',
    url: 'https://nyaa.si',
    content: 'anime',
    languages: ['en', 'ja', 'multi'],
    use: ['torrent-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'No recomendado como integración base de MapleVault; requiere revisión legal, filtros y consentimiento explícito.'
  },
  {
    id: 'animeav1',
    name: 'AnimeAV1',
    url: 'https://animev1.com',
    content: 'anime',
    languages: ['es'],
    use: ['streaming-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Ya existe como fuente de episodios; requiere validación estricta de identidad y rate limit conservador.'
  },
  {
    id: 'tioanime',
    name: 'TioAnime',
    url: 'https://tioanime.com',
    content: 'anime',
    languages: ['es'],
    use: ['streaming-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Fuente en español existente; mantener como adaptador aislado y con degradación ante cambios HTML.'
  },
  {
    id: 'jkanime',
    name: 'JKAnime',
    url: 'https://jkanime.net',
    content: 'anime',
    languages: ['es'],
    use: ['streaming-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Fuente en español existente; usar como fallback cuando AnimeAV1 no valida identidad.'
  },
  {
    id: 'animeflv',
    name: 'AnimeFLV',
    url: 'https://animeflv.net',
    content: 'anime',
    languages: ['es'],
    use: ['streaming-provider'],
    risk: 'high',
    enabledByDefault: false,
    notes: 'Fuente en español existente; tratar como HTML inestable y nunca bloquear UI si falla.'
  }
];

export function getMediaSourceCandidates(): MediaSourceCandidate[] {
  return MEDIA_SOURCE_CANDIDATES;
}

export function getRecommendedAnimeSourceIntegrations(): RecommendedAnimeSourceIntegration[] {
  return RECOMMENDED_ANIME_SOURCE_INTEGRATIONS;
}

export function getMapleVaultPlayerCapabilities() {
  return MAPLEVAULT_PLAYER_CAPABILITIES;
}
