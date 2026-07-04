import { Router } from 'express';
import { query } from '../database/db';
import {
  getAniListAnimeById,
  getAnimeAV1Embeds,
  getAnimeAV1Episodes,
  getAnimeAV1Media,
  getAnimeAV1Slug,
  getAnimeFLVEpisodes,
  getAnimeFLVServers,
  getAnimeFLVSlug,
  getJKAnimeEpisodes,
  getJKAnimeServers,
  getJKAnimeSlug,
  getTioAnimeEpisodes,
  getTioAnimeServers,
  getTioAnimeSlug
} from '../scraping/scraper';
import { validateAnimeAV1Identity } from '../scraping/animeAV1Identity';
import { validateId } from '../security/validators';
import {
  clearAnimeSlug,
  getAnimeForSlugLookup,
  getAnimeSlug,
  getWatchedEpisodeNumbers,
  saveAnimeMalId,
  saveAnimeSlug,
  setEpisodeWatchedState
} from './episodeRepository';
import { getErrorMessage as getSharedErrorMessage } from './routeUtils';

type QueryClient = Pick<typeof query, 'get' | 'all' | 'run'>;

interface EpisodeScraperService {
  getAniListAnimeById: typeof getAniListAnimeById;
  getAnimeAV1Slug: typeof getAnimeAV1Slug;
  getAnimeAV1Episodes: typeof getAnimeAV1Episodes;
  getAnimeAV1Media: typeof getAnimeAV1Media;
  getAnimeAV1Embeds: typeof getAnimeAV1Embeds;
  getTioAnimeSlug: typeof getTioAnimeSlug;
  getTioAnimeEpisodes: typeof getTioAnimeEpisodes;
  getTioAnimeServers: typeof getTioAnimeServers;
  getJKAnimeSlug: typeof getJKAnimeSlug;
  getJKAnimeEpisodes: typeof getJKAnimeEpisodes;
  getJKAnimeServers: typeof getJKAnimeServers;
  getAnimeFLVSlug: typeof getAnimeFLVSlug;
  getAnimeFLVEpisodes: typeof getAnimeFLVEpisodes;
  getAnimeFLVServers: typeof getAnimeFLVServers;
}

interface EpisodeRouterDependencies {
  queryClient?: QueryClient;
  scraperService?: EpisodeScraperService;
}

interface ProviderRouteConfig {
  routePrefix: string;
  sourceLabel: string;
  slugColumn: string;
  getSlug: EpisodeScraperService['getTioAnimeSlug'];
  getEpisodes: EpisodeScraperService['getTioAnimeEpisodes'];
  getServers: EpisodeScraperService['getTioAnimeServers'];
  buildEpisodeUrl: (slug: string, episodeNumber: number) => string;
}

const defaultScraperService: EpisodeScraperService = {
  getAniListAnimeById,
  getAnimeAV1Slug,
  getAnimeAV1Episodes,
  getAnimeAV1Media,
  getAnimeAV1Embeds,
  getTioAnimeSlug,
  getTioAnimeEpisodes,
  getTioAnimeServers,
  getJKAnimeSlug,
  getJKAnimeEpisodes,
  getJKAnimeServers,
  getAnimeFLVSlug,
  getAnimeFLVEpisodes,
  getAnimeFLVServers
};

function getErrorMessage(error: unknown): string {
  return getSharedErrorMessage(error, 'Error interno en episodios.');
}

export function prioritizeServers(servers: any): any {
  if (Array.isArray(servers)) {
    return [...servers].sort((a, b) => {
      const aName = String(a.server || a.name || '').toLowerCase();
      const bName = String(b.server || b.name || '').toLowerCase();
      const aPriority = aName.includes('mega') || aName.includes('1fichier') ? 1 : 0;
      const bPriority = bName.includes('mega') || bName.includes('1fichier') ? 1 : 0;
      return bPriority - aPriority;
    });
  }

  if (servers && typeof servers === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in servers) {
      result[key] = Array.isArray(servers[key]) ? prioritizeServers(servers[key]) : servers[key];
    }
    return result;
  }

  return servers;
}

function registerProviderRoutes(
  router: Router,
  queryClient: QueryClient,
  config: ProviderRouteConfig
) {
  router.get(`/${config.routePrefix}/:id/episodes`, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const anime = await getAnimeForSlugLookup(queryClient, id, config.slugColumn);

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      let slug = anime[config.slugColumn];
      if (!slug) {
        slug = await config.getSlug(anime.title, anime.title_romaji, anime.title_english);
        if (slug) {
          try {
            await saveAnimeSlug(queryClient, id, config.slugColumn, slug);
          } catch (_) {}
        }
      }

      if (!slug) {
        return res.status(404).json({ error: `No se encontro este anime en ${config.sourceLabel}` });
      }

      const episodes = await config.getEpisodes(slug);
      res.json({ slug, episodes });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get(`/${config.routePrefix}/:id/episodes/:number/servers`, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const number = parseInt(req.params.number, 10);
      const anime = await getAnimeSlug(queryClient, id, config.slugColumn);

      if (!anime || !anime[config.slugColumn]) {
        return res.status(404).json({
          error: `No se encontro el slug de ${config.sourceLabel} para este anime. Primero llama a GET /${config.routePrefix}/:id/episodes.`
        });
      }

      const episodeUrl = config.buildEpisodeUrl(anime[config.slugColumn], number);
      const servers = await config.getServers(episodeUrl);
      res.json(prioritizeServers(servers));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}

export function createEpisodeRouter({
  queryClient = query,
  scraperService = defaultScraperService
}: EpisodeRouterDependencies = {}) {
  const router = Router();

  async function hydrateMalId(anime: any): Promise<void> {
    if (Number.isInteger(Number(anime.mal_id)) && Number(anime.mal_id) > 0) return;
    if (String(anime.source || '').toLowerCase() !== 'anilist') return;

    const externalId = Number(anime.external_id);
    if (!Number.isInteger(externalId) || externalId <= 0) return;

    const refreshed = await scraperService.getAniListAnimeById(externalId);
    const malId = Number(refreshed?.mal_id);
    if (!Number.isInteger(malId) || malId <= 0) return;

    anime.mal_id = malId;
    await saveAnimeMalId(queryClient, anime.id, malId);
  }

  async function isVerifiedAnimeAV1Media(anime: any, media: any): Promise<boolean> {
    await hydrateMalId(anime);
    const validation = validateAnimeAV1Identity(anime, media);
    if (!validation.matches) {
      console.warn(
        `[MapleVault] AnimeAV1 rechazo la asociacion anime=${anime.id} slug=${media.slug}: ${validation.reason}`
      );
    }
    return validation.matches;
  }

  router.get('/anime/:id/episodes', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const anime = await getAnimeForSlugLookup(queryClient, id, 'animeav1_slug');

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      let slug = anime.animeav1_slug;
      let media = null;
      const rejectedSlugs = new Set<string>();

      if (slug) {
        try {
          media = await scraperService.getAnimeAV1Media(slug);
        } catch {
          media = null;
        }
        if (!media || !await isVerifiedAnimeAV1Media(anime, media)) {
          rejectedSlugs.add(slug);
          await clearAnimeSlug(queryClient, id, 'animeav1_slug');
          slug = null;
          media = null;
        }
      }

      if (!slug) {
        for (let attempt = 0; attempt < 5 && !slug; attempt += 1) {
          const candidateSlug = await scraperService.getAnimeAV1Slug(
            anime.title,
            anime.title_romaji,
            anime.title_english,
            [...rejectedSlugs]
          );
          if (!candidateSlug || rejectedSlugs.has(candidateSlug)) break;

          let candidateMedia;
          try {
            candidateMedia = await scraperService.getAnimeAV1Media(candidateSlug);
          } catch {
            rejectedSlugs.add(candidateSlug);
            continue;
          }
          if (!await isVerifiedAnimeAV1Media(anime, candidateMedia)) {
            rejectedSlugs.add(candidateSlug);
            continue;
          }

          slug = candidateSlug;
          media = candidateMedia;
          await saveAnimeSlug(queryClient, id, 'animeav1_slug', slug);
        }
      }

      if (!slug || !media) {
        return res.status(404).json({
          error: 'No se encontro una coincidencia verificada para este anime en AnimeAV1',
          code: 'ANIMEAV1_IDENTITY_NOT_VERIFIED'
        });
      }

      res.json({
        slug,
        episodes: media.episodes,
        availability: media.episodes.length > 0 ? 'available' : 'not_published',
        sourceTitle: media.title,
        extractionSource: media.extractionSource
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/anime/:id/watched-episodes', async (req, res) => {
    try {
      const id = validateId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'ID invalido.' });
      }

      res.json(await getWatchedEpisodeNumbers(queryClient, id));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post('/anime/:id/episodes/:number/watch', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const episodeNumber = parseInt(req.params.number, 10);
      const { watched } = req.body;

      if (Number.isNaN(id) || Number.isNaN(episodeNumber)) {
        return res.status(400).json({ error: 'Parametros invalidos.' });
      }

      const watchedCount = await setEpisodeWatchedState(queryClient, id, episodeNumber, Boolean(watched));

      res.json({ success: true, watched, watchedCount });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get('/anime/:id/episodes/:number', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const number = parseInt(req.params.number, 10);
      const anime = await getAnimeForSlugLookup(queryClient, id, 'animeav1_slug');

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      if (!anime.animeav1_slug) {
        return res.status(404).json({ error: 'Anime no tiene un slug de AnimeAV1 asociado' });
      }

      const media = await scraperService.getAnimeAV1Media(anime.animeav1_slug);
      if (!await isVerifiedAnimeAV1Media(anime, media)) {
        await clearAnimeSlug(queryClient, id, 'animeav1_slug');
        return res.status(404).json({
          error: 'La fuente guardada no corresponde a esta serie o temporada',
          code: 'ANIMEAV1_IDENTITY_NOT_VERIFIED'
        });
      }

      if (!media.episodes.some(episode => episode.number === number)) {
        return res.status(404).json({ error: 'El capitulo solicitado no esta publicado para esta serie' });
      }

      const embeds = await scraperService.getAnimeAV1Embeds(anime.animeav1_slug, number);
      res.json(prioritizeServers(embeds));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  registerProviderRoutes(router, queryClient, {
    routePrefix: 'tioanime',
    sourceLabel: 'TioAnime',
    slugColumn: 'tioanime_slug',
    getSlug: scraperService.getTioAnimeSlug,
    getEpisodes: scraperService.getTioAnimeEpisodes,
    getServers: scraperService.getTioAnimeServers,
    buildEpisodeUrl: (slug, episodeNumber) => `https://tioanime.com/ver/${slug}-${episodeNumber}`
  });

  registerProviderRoutes(router, queryClient, {
    routePrefix: 'jkanime',
    sourceLabel: 'JKAnime',
    slugColumn: 'jkanime_slug',
    getSlug: scraperService.getJKAnimeSlug,
    getEpisodes: scraperService.getJKAnimeEpisodes,
    getServers: scraperService.getJKAnimeServers,
    buildEpisodeUrl: (slug, episodeNumber) => `https://jkanime.net/${slug}/${episodeNumber}/`
  });

  registerProviderRoutes(router, queryClient, {
    routePrefix: 'animeflv',
    sourceLabel: 'AnimeFLV',
    slugColumn: 'animeflv_slug',
    getSlug: scraperService.getAnimeFLVSlug,
    getEpisodes: scraperService.getAnimeFLVEpisodes,
    getServers: scraperService.getAnimeFLVServers,
    buildEpisodeUrl: (slug, episodeNumber) => `https://www3.animeflv.net/ver/${slug}-${episodeNumber}`
  });

  return router;
}
