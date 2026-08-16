import type { AnimeEpisodeIdentity, EpisodeSourceBinding } from './externalEpisodeRepository';
import type { PlaybackMode } from './playbackServer';

export type ExternalEpisodeProviderId = 'gogoanime' | 'animepahe' | 'aniwaves' | 'aniwatch';

export interface EpisodeProviderDescriptor {
  id: ExternalEpisodeProviderId;
  label: string;
  language: 'en';
  baseUrl: string;
  stability: 'beta';
}

export interface ExternalEpisode {
  id: string;
  number: number;
  title?: string;
  url: string;
}

export interface RawEpisodeServer {
  server: string;
  url: string;
  playbackMode?: Exclude<PlaybackMode, 'inline'>;
}

export interface ExternalEpisodeServers {
  referer: string;
  variants: Record<string, RawEpisodeServer[]>;
}

export interface ExternalEpisodeProvider {
  descriptor: EpisodeProviderDescriptor;
  findSeries(anime: AnimeEpisodeIdentity): Promise<EpisodeSourceBinding | null>;
  getEpisodes(binding: EpisodeSourceBinding): Promise<ExternalEpisode[]>;
  getServers(
    binding: EpisodeSourceBinding,
    episode: ExternalEpisode
  ): Promise<ExternalEpisodeServers>;
}
