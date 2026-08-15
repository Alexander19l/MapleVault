import { Router } from 'express';
import { query } from '../database/db';
import {
  createExternalEpisodeProviderRegistry,
  hasExternalEpisodeServers,
  type ExternalEpisodeProviderRegistry
} from '../episodes/externalEpisodeProviders';
import {
  getAnimeEpisodeIdentity,
  clearEpisodeSourceBinding,
  getEpisodeSourceBinding,
  saveEpisodeSourceBinding,
  type EpisodeSourceBinding,
  type ExternalEpisodeQueryClient
} from '../episodes/externalEpisodeRepository';
import { decoratePlaybackServers } from '../episodes/playbackServer';
import type {
  ExternalEpisode,
  ExternalEpisodeProvider,
  ExternalEpisodeProviderId
} from '../episodes/externalEpisodeTypes';
import { isAnimeTitleMatch } from '../scraping/animeTitleMatching';
import { validateId } from '../security/validators';

interface ExternalEpisodeRouterDependencies {
  queryClient?: ExternalEpisodeQueryClient;
  providers?: ExternalEpisodeProviderRegistry;
}

export const EXTERNAL_EPISODE_LIST_CACHE_TTL_MS = 60_000;
const MAX_EXTERNAL_EPISODE_LIST_CACHE_ENTRIES = 128;

interface EpisodeListCacheEntry {
  expiresAt: number;
  episodes: ExternalEpisode[];
}

function getProvider(
  providers: ExternalEpisodeProviderRegistry,
  rawProviderId: string
): ExternalEpisodeProvider | null {
  return providers.get(rawProviderId as ExternalEpisodeProviderId) || null;
}

async function resolveBinding(
  queryClient: ExternalEpisodeQueryClient,
  provider: ExternalEpisodeProvider,
  animeId: number
): Promise<EpisodeSourceBinding | null | undefined> {
  const anime = await getAnimeEpisodeIdentity(queryClient, animeId);
  if (!anime) return undefined;

  const cached = await getEpisodeSourceBinding(queryClient, animeId, provider.descriptor.id);
  if (cached) {
    const aliases = [anime.title, anime.title_romaji, anime.title_english];
    const isCompatible = cached.animeId === anime.id
      && cached.providerId === provider.descriptor.id
      && isAnimeTitleMatch(aliases, cached.sourceTitle);
    if (isCompatible) return cached;

    // La asociación es regenerable y puede provenir de un slug obsoleto o de
    // otra temporada. Se elimina solo esta relación antes de volver a buscar.
    await clearEpisodeSourceBinding(queryClient, animeId, provider.descriptor.id);
  }

  const resolved = await provider.findSeries(anime);
  if (!resolved) return null;
  await saveEpisodeSourceBinding(queryClient, resolved);
  return resolved;
}

function parseEpisodeNumber(value: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100_000 ? number : null;
}

function findEpisode(episodes: ExternalEpisode[], episodeNumber: number): ExternalEpisode | null {
  return episodes.find(episode => Math.abs(episode.number - episodeNumber) < 0.0001) || null;
}

function getEpisodeListCacheKey(
  provider: ExternalEpisodeProvider,
  binding: EpisodeSourceBinding
): string {
  return [provider.descriptor.id, binding.animeId, binding.externalKey, binding.sourceUrl].join(':');
}

async function getCachedEpisodeList(
  provider: ExternalEpisodeProvider,
  binding: EpisodeSourceBinding,
  cache: Map<string, EpisodeListCacheEntry>
): Promise<ExternalEpisode[]> {
  const key = getEpisodeListCacheKey(provider, binding);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    // Reinsert the hit to keep the map ordered as a small LRU cache.
    cache.delete(key);
    cache.set(key, cached);
    return cached.episodes;
  }
  if (cached) cache.delete(key);

  const episodes = await provider.getEpisodes(binding);
  cache.set(key, {
    expiresAt: Date.now() + EXTERNAL_EPISODE_LIST_CACHE_TTL_MS,
    episodes
  });

  while (cache.size > MAX_EXTERNAL_EPISODE_LIST_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    cache.delete(oldestKey);
  }

  return episodes;
}

export function createExternalEpisodeRouter({
  queryClient = query,
  providers = createExternalEpisodeProviderRegistry()
}: ExternalEpisodeRouterDependencies = {}) {
  const router = Router();
  const episodeListCache = new Map<string, EpisodeListCacheEntry>();

  router.get('/episode-sources', (_req, res) => {
    res.json([...providers.values()].map(provider => provider.descriptor));
  });

  router.get('/episode-sources/:providerId/anime/:id/episodes', async (req, res) => {
    const provider = getProvider(providers, req.params.providerId);
    if (!provider) return res.status(404).json({ error: 'Fuente de episodios no disponible.' });
    const animeId = validateId(req.params.id);
    if (!animeId) return res.status(400).json({ error: 'ID de anime inválido.' });

    try {
      const binding = await resolveBinding(queryClient, provider, animeId);
      if (binding === undefined) return res.status(404).json({ error: 'Anime no encontrado.' });
      if (binding === null) {
        return res.status(404).json({
          error: `No se encontró una coincidencia verificada en ${provider.descriptor.label}.`,
          code: 'EXTERNAL_SOURCE_IDENTITY_NOT_VERIFIED'
        });
      }

      const episodes = await getCachedEpisodeList(provider, binding, episodeListCache);
      return res.json({
        provider: provider.descriptor,
        sourceTitle: binding.sourceTitle,
        sourceUrl: binding.sourceUrl,
        availability: episodes.length > 0 ? 'available' : 'not_published',
        episodes
      });
    } catch (error) {
      console.warn(`[MapleVault] ${provider.descriptor.label}: no se pudieron cargar episodios.`, error);
      return res.status(502).json({
        error: `${provider.descriptor.label} no respondió correctamente. Prueba otra fuente.`,
        code: 'EXTERNAL_EPISODE_SOURCE_UNAVAILABLE'
      });
    }
  });

  router.get('/episode-sources/:providerId/anime/:id/episodes/:number/servers', async (req, res) => {
    const provider = getProvider(providers, req.params.providerId);
    if (!provider) return res.status(404).json({ error: 'Fuente de episodios no disponible.' });
    const animeId = validateId(req.params.id);
    const episodeNumber = parseEpisodeNumber(req.params.number);
    if (!animeId || episodeNumber === null) {
      return res.status(400).json({ error: 'Parámetros de episodio inválidos.' });
    }

    try {
      const binding = await resolveBinding(queryClient, provider, animeId);
      if (binding === undefined) return res.status(404).json({ error: 'Anime no encontrado.' });
      if (binding === null) {
        return res.status(404).json({
          error: `No se encontró una coincidencia verificada en ${provider.descriptor.label}.`,
          code: 'EXTERNAL_SOURCE_IDENTITY_NOT_VERIFIED'
        });
      }

      const episodes = await getCachedEpisodeList(provider, binding, episodeListCache);
      const episode = findEpisode(episodes, episodeNumber);
      if (!episode) {
        return res.status(404).json({ error: 'El episodio no está publicado en esta fuente.' });
      }

      const result = await provider.getServers(binding, episode);
      if (!hasExternalEpisodeServers(result)) {
        return res.status(404).json({
          error: `${provider.descriptor.label} no publicó servidores utilizables para este episodio.`
        });
      }

      return res.json(decoratePlaybackServers(result.variants, {
        providerId: provider.descriptor.id,
        language: provider.descriptor.language,
        referer: result.referer,
        forceWindow: true
      }));
    } catch (error) {
      console.warn(`[MapleVault] ${provider.descriptor.label}: no se pudieron cargar servidores.`, error);
      return res.status(502).json({
        error: `${provider.descriptor.label} no respondió correctamente. Prueba otro servidor o fuente.`,
        code: 'EXTERNAL_EPISODE_SERVERS_UNAVAILABLE'
      });
    }
  });

  return router;
}
