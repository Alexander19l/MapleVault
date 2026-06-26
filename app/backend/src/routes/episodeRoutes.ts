import { Router } from 'express';
import { query } from '../database/db';
import {
  getAnimeAV1Embeds,
  getAnimeAV1Episodes,
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
import { validateId } from '../security/validators';
import {
  getAnimeForSlugLookup,
  getAnimeSlug,
  getWatchedEpisodeNumbers,
  saveAnimeSlug,
  setEpisodeWatchedState
} from './episodeRepository';

type QueryClient = Pick<typeof query, 'get' | 'all' | 'run'>;

interface EpisodeScraperService {
  getAnimeAV1Slug: typeof getAnimeAV1Slug;
  getAnimeAV1Episodes: typeof getAnimeAV1Episodes;
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
  getAnimeAV1Slug,
  getAnimeAV1Episodes,
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
  return error instanceof Error ? error.message : 'Error interno en episodios.';
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

  router.get('/anime/:id/episodes', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const anime = await getAnimeForSlugLookup(queryClient, id, 'animeav1_slug');

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      let slug = anime.animeav1_slug;
      if (!slug) {
        slug = await scraperService.getAnimeAV1Slug(anime.title, anime.title_romaji, anime.title_english);
        if (slug) {
          await saveAnimeSlug(queryClient, id, 'animeav1_slug', slug);
        }
      }

      if (!slug) {
        return res.status(404).json({ error: 'No se encontro este anime en AnimeAV1' });
      }

      const episodes = await scraperService.getAnimeAV1Episodes(slug);
      res.json({ slug, episodes });
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
      const anime = await getAnimeSlug(queryClient, id, 'animeav1_slug');

      if (!anime) {
        return res.status(404).json({ error: 'Anime no encontrado' });
      }

      if (!anime.animeav1_slug) {
        return res.status(404).json({ error: 'Anime no tiene un slug de AnimeAV1 asociado' });
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
