import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import {
  findBestAnimeTitleMatch,
  isAnimeTitleMatch,
  normalizeAnimeTitle
} from '../scraping/animeTitleMatching';
import type {
  AnimeEpisodeIdentity,
  EpisodeSourceBinding
} from './externalEpisodeRepository';
import type {
  ExternalEpisode,
  ExternalEpisodeProvider,
  ExternalEpisodeProviderId,
  ExternalEpisodeServers,
  RawEpisodeServer
} from './externalEpisodeTypes';
import type { PlaybackMode } from './playbackServer';

const SOURCE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_SERIES_PROBES = 7;
const MAX_SERVERS_PER_EPISODE = 6;
const UNSUPPORTED_PLAYER_HOSTS = new Set([
  'gn1r5n.org',
  'myvidplay.com'
]);
const DIRECT_WINDOW_PLAYER_HOSTS = new Set([
  'play.echovideo.ru',
  'play2.echovideo.ru'
]);

interface SourceHttpClient {
  get: AxiosInstance['get'];
}

interface SourcePage {
  html: string;
  finalUrl: string;
}

function getAliases(anime: AnimeEpisodeIdentity): string[] {
  return [...new Set([
    anime.title,
    anime.title_romaji,
    anime.title_english
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim()))];
}

function titleToSlug(value: string): string {
  return normalizeAnimeTitle(value).replace(/\s+/g, '-');
}

function getAllowedUrl(value: unknown, allowedHosts: string[]): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isAllowedHost = allowedHosts.some(host => (
      hostname === host || hostname.endsWith(`.${host}`)
    ));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !isAllowedHost) {
      return null;
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveAllowedUrl(
  value: unknown,
  baseUrl: string,
  allowedHosts: string[]
): string | null {
  if (typeof value !== 'string') return null;
  try {
    return getAllowedUrl(new URL(value, baseUrl).toString(), allowedHosts);
  } catch {
    return null;
  }
}

function getAnySafeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getExternalServerPlaybackMode(
  value: unknown
): Exclude<PlaybackMode, 'inline'> | null {
  const safeUrl = getAnySafeHttpUrl(value);
  if (!safeUrl) return null;
  const hostname = new URL(safeUrl).hostname.toLowerCase();
  if (UNSUPPORTED_PLAYER_HOSTS.has(hostname)) return null;
  return DIRECT_WINDOW_PLAYER_HOSTS.has(hostname) ? 'direct-window' : 'window';
}

async function getPage(
  http: SourceHttpClient,
  url: string,
  referer?: string
): Promise<SourcePage> {
  const response = await http.get(url, {
    headers: {
      'User-Agent': SOURCE_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      ...(referer ? { Referer: referer } : {})
    }
  });
  if (typeof response.data !== 'string') {
    throw new Error('La fuente no devolvió una página HTML válida.');
  }
  return {
    html: response.data,
    finalUrl: response.request?.res?.responseUrl || url
  };
}

function getSeriesTitle(html: string): string {
  const $ = cheerio.load(html);
  const heading = $('.entry-title, .anime-title, .infox h1, h1').first().text().replace(/\s+/g, ' ').trim();
  if (heading) return heading;

  return $('title').first().text()
    .replace(/^Watch\s+/i, '')
    .replace(/\s+(?:Anime Free|Online Free|\|.*|-\s*(?:Gogoanime|Animepahe)).*$/i, '')
    .trim();
}

function getEpisodeNumber(element: cheerio.Cheerio<any>, href: string): number | null {
  const dataNumber = element.attr('data-number') || element.attr('data-num');
  const text = element.text().replace(/\s+/g, ' ').trim();
  const textMatch = text.match(/(?:episode|ep\.?|cap(?:i|í)tulo)?\s*#?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/^\s*(\d+(?:\.\d+)?)(?:\s|$)/);
  const hrefMatch = href.match(/(?:episode|ep)-(?<whole>\d+)(?:-(?<decimal>\d+))?(?:-|\/|$)/i);
  const rawValue = dataNumber
    || textMatch?.[1]
    || (hrefMatch?.groups?.decimal
      ? `${hrefMatch.groups.whole}.${hrefMatch.groups.decimal}`
      : hrefMatch?.groups?.whole);
  const number = Number(rawValue);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseWordPressEpisodes(
  html: string,
  baseUrl: string,
  providerKey: string
): ExternalEpisode[] {
  const $ = cheerio.load(html);
  let anchors = $('.eplister a[href], .episodelist a[href], #episode_related a[href]');
  if (anchors.length === 0) {
    anchors = $('a[href*="episode-"]');
  }

  const episodesByNumber = new Map<number, ExternalEpisode>();
  anchors.each((_, node) => {
    const anchor = $(node);
    const rawHref = anchor.attr('href');
    if (!rawHref) return;

    const absoluteUrl = resolveAllowedUrl(rawHref, baseUrl, [new URL(baseUrl).hostname]);
    if (!absoluteUrl) return;

    const number = getEpisodeNumber(anchor, absoluteUrl);
    if (number === null) return;
    episodesByNumber.set(number, {
      id: `${providerKey}:${number}`,
      number,
      title: anchor.text().replace(/\s+/g, ' ').trim() || undefined,
      url: absoluteUrl
    });
  });

  return [...episodesByNumber.values()].sort((left, right) => left.number - right.number);
}

function getServerNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0] || 'Servidor';
  } catch {
    return 'Servidor';
  }
}

export function parseWordPressServers(html: string, baseUrl: string): RawEpisodeServer[] {
  const $ = cheerio.load(html);
  const servers: RawEpisodeServer[] = [];
  const seen = new Set<string>();

  $('[data-src]').each((_, node) => {
    const element = $(node);
    const rawUrl = element.attr('data-src');
    if (!rawUrl) return;
    let url: string;
    try {
      url = new URL(rawUrl, baseUrl).toString();
    } catch {
      return;
    }
    if (!getAnySafeHttpUrl(url) || seen.has(url)) return;
    seen.add(url);
    servers.push({
      server: String(
        element.attr('data-type')
        || element.attr('data-server')
        || element.text()
        || getServerNameFromUrl(url)
      ).replace(/\s+/g, ' ').trim().slice(0, 80),
      url
    });
  });

  $('iframe[src]').each((_, node) => {
    const rawUrl = $(node).attr('src');
    if (!rawUrl) return;
    let url: string;
    try {
      url = new URL(rawUrl, baseUrl).toString();
    } catch {
      return;
    }
    if (!getAnySafeHttpUrl(url) || seen.has(url)) return;
    seen.add(url);
    servers.push({ server: getServerNameFromUrl(url), url });
  });

  return servers.slice(0, MAX_SERVERS_PER_EPISODE);
}

export function parseAniwavesEpisodes(html: string, baseUrl: string, providerKey: string): ExternalEpisode[] {
  const $ = cheerio.load(html);
  const episodes: ExternalEpisode[] = [];
  const seen = new Set<number>();

  $('a[data-num]').each((_, node) => {
    const anchor = $(node);
    const number = Number(anchor.attr('data-num'));
    const href = anchor.attr('href');
    if (!Number.isFinite(number) || number <= 0 || !href || seen.has(number)) return;
    const url = resolveAllowedUrl(href, baseUrl, [new URL(baseUrl).hostname]);
    if (!url) return;
    seen.add(number);
    episodes.push({
      id: `${providerKey}:${number}`,
      number,
      title: anchor.attr('title') || anchor.text().replace(/\s+/g, ' ').trim() || undefined,
      url
    });
  });

  return episodes.sort((left, right) => left.number - right.number);
}

export function parseAniwatchEpisodes(html: string, baseUrl: string): ExternalEpisode[] {
  const $ = cheerio.load(html);
  const episodes: ExternalEpisode[] = [];
  const seen = new Set<number>();

  $('.ep-item[data-id]').each((_, node) => {
    const anchor = $(node);
    const number = Number(anchor.attr('data-number'));
    const episodeId = String(anchor.attr('data-id') || '');
    const href = anchor.attr('href');
    if (!episodeId || !Number.isFinite(number) || number <= 0 || !href || seen.has(number)) return;
    const url = resolveAllowedUrl(href, baseUrl, [new URL(baseUrl).hostname]);
    if (!url) return;
    seen.add(number);
    episodes.push({
      id: episodeId,
      number,
      title: anchor.attr('title') || anchor.text().replace(/\s+/g, ' ').trim() || undefined,
      url
    });
  });

  return episodes.sort((left, right) => left.number - right.number);
}

export function parseAniwatchServers(html: string): Record<string, RawEpisodeServer[]> {
  const $ = cheerio.load(html);
  const variants: Record<string, RawEpisodeServer[]> = {};
  const seen = new Set<string>();

  $('.server-item[data-hash]').each((_, node) => {
    const element = $(node);
    const encodedUrl = element.attr('data-hash');
    if (!encodedUrl || encodedUrl.length > 8192) return;

    let url: string;
    try {
      url = Buffer.from(encodedUrl, 'base64').toString('utf8');
    } catch {
      return;
    }
    if (!getAnySafeHttpUrl(url) || seen.has(url)) return;
    seen.add(url);

    const typeHint = [
      element.attr('data-type'),
      element.closest('[data-type]').attr('data-type'),
      element.closest('.ps_-block, .server-block').attr('class')
    ].filter(Boolean).join(' ');
    const variant = /dub/i.test(typeHint) ? 'DUB' : 'SUB';
    const server = String(element.attr('data-server-name') || getServerNameFromUrl(url))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    (variants[variant] ||= []).push({ server, url });
  });

  return variants;
}

function createWordPressProvider(options: {
  id: 'gogoanime' | 'animepahe';
  label: string;
  baseUrl: string;
  resolveSeries: (
    http: SourceHttpClient,
    anime: AnimeEpisodeIdentity
  ) => Promise<{ key: string; title: string; url: string } | null>;
}, http: SourceHttpClient): ExternalEpisodeProvider {
  return {
    descriptor: {
      id: options.id,
      label: options.label,
      language: 'en',
      baseUrl: options.baseUrl,
      stability: 'beta'
    },
    async findSeries(anime) {
      const match = await options.resolveSeries(http, anime);
      return match ? {
        animeId: anime.id,
        providerId: options.id,
        externalKey: match.key,
        sourceTitle: match.title,
        sourceUrl: match.url
      } : null;
    },
    async getEpisodes(binding) {
      const sourceUrl = getAllowedUrl(binding.sourceUrl, [new URL(options.baseUrl).hostname]);
      if (!sourceUrl) throw new Error('La asociación guardada contiene una URL no permitida.');
      const page = await getPage(http, sourceUrl, options.baseUrl);
      return parseWordPressEpisodes(page.html, options.baseUrl, binding.externalKey);
    },
    async getServers(_binding, episode) {
      const episodeUrl = getAllowedUrl(episode.url, [new URL(options.baseUrl).hostname]);
      if (!episodeUrl) throw new Error('La URL del episodio no pertenece a la fuente seleccionada.');
      const page = await getPage(http, episodeUrl, options.baseUrl);
      return {
        referer: episodeUrl,
        variants: { SUB: parseWordPressServers(page.html, options.baseUrl) }
      };
    }
  };
}

async function resolveGogoanimeSeries(
  http: SourceHttpClient,
  anime: AnimeEpisodeIdentity
): Promise<{ key: string; title: string; url: string } | null> {
  const baseUrl = 'https://gogoanime.by';
  const aliases = getAliases(anime);
  const baseSlugs = aliases.map(titleToSlug).filter(Boolean);
  const slugs = [...new Set([
    ...baseSlugs,
    ...baseSlugs.slice(0, 2).flatMap(slug => [`${slug}-online`, `${slug}-watch`])
  ])].slice(0, MAX_SERIES_PROBES);

  for (const slug of slugs) {
    const requestedUrl = `${baseUrl}/series/${encodeURIComponent(slug)}/`;
    try {
      const page = await getPage(http, requestedUrl, baseUrl);
      const finalUrl = getAllowedUrl(page.finalUrl, ['gogoanime.by']);
      if (!finalUrl || !new URL(finalUrl).pathname.startsWith('/series/')) continue;
      const title = getSeriesTitle(page.html);
      if (!isAnimeTitleMatch(aliases, title)) continue;
      const key = new URL(finalUrl).pathname.split('/').filter(Boolean)[1];
      if (key) return { key, title, url: finalUrl };
    } catch {
      // Se prueban pocos alias verificados y luego se degrada a no disponible.
    }
  }
  return null;
}

function createAnimepaheSeriesResolver() {
  let sitemapCache: { expiresAt: number; urls: string[] } | null = null;

  return async (
    http: SourceHttpClient,
    anime: AnimeEpisodeIdentity
  ): Promise<{ key: string; title: string; url: string } | null> => {
    const baseUrl = 'https://animepahe.ch';
    const aliases = getAliases(anime);

    if (!sitemapCache || sitemapCache.expiresAt <= Date.now()) {
      try {
        const sitemap = await getPage(http, `${baseUrl}/series-sitemap.xml`, baseUrl);
        sitemapCache = {
          expiresAt: Date.now() + 15 * 60 * 1000,
          urls: [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/gi)]
            .map(match => match[1].trim())
            .filter(url => url.includes('/series/'))
        };
      } catch {
        sitemapCache = { expiresAt: Date.now() + 60 * 1000, urls: [] };
      }
    }

    const candidates = sitemapCache.urls.flatMap(url => {
      const safeUrl = getAllowedUrl(url, ['animepahe.ch']);
      if (!safeUrl) return [];
      const key = new URL(safeUrl).pathname.split('/').filter(Boolean)[1] || '';
      return key ? [{ slug: key, title: key.replace(/-/g, ' '), url: safeUrl }] : [];
    });
    const match = findBestAnimeTitleMatch(aliases, candidates);
    const directSlug = titleToSlug(aliases[0] || '');
    const candidateUrls = [
      match ? candidates.find(candidate => candidate.slug === match.candidate.slug)?.url : null,
      directSlug ? `${baseUrl}/series/${directSlug}/` : null
    ].filter((url): url is string => Boolean(url));

    for (const requestedUrl of [...new Set(candidateUrls)]) {
      try {
        const page = await getPage(http, requestedUrl, baseUrl);
        const finalUrl = getAllowedUrl(page.finalUrl, ['animepahe.ch']);
        if (!finalUrl || !new URL(finalUrl).pathname.startsWith('/series/')) continue;
        const key = new URL(finalUrl).pathname.split('/').filter(Boolean)[1];
        const title = getSeriesTitle(page.html) || key.replace(/-/g, ' ');
        if (key && isAnimeTitleMatch(aliases, title)) return { key, title, url: finalUrl };
      } catch {
        // La fuente es opcional y puede no contener el título solicitado.
      }
    }
    return null;
  };
}

function createAniwavesProvider(http: SourceHttpClient): ExternalEpisodeProvider {
  const baseUrl = 'https://aniwaves.ru';
  return {
    descriptor: {
      id: 'aniwaves',
      label: 'Aniwaves',
      language: 'en',
      baseUrl,
      stability: 'beta'
    },
    async findSeries(anime) {
      const aliases = getAliases(anime);
      for (const alias of aliases) {
        try {
          const page = await getPage(http, `${baseUrl}/filter?keyword=${encodeURIComponent(alias)}`, baseUrl);
          const $ = cheerio.load(page.html);
          const candidates: Array<{ slug: string; title: string; url: string }> = [];
          $('a.name.d-title[href], .name.d-title a[href]').each((_, node) => {
            const link = $(node);
            const href = link.attr('href');
            const title = link.text().replace(/\s+/g, ' ').trim();
            if (!href || !title) return;
            const url = resolveAllowedUrl(href, baseUrl, ['aniwaves.ru']);
            if (!url) return;
            const key = new URL(url).pathname.match(/-(\d+)\/?$/)?.[1];
            if (key) candidates.push({ slug: key, title, url });
          });
          const match = findBestAnimeTitleMatch(aliases, candidates);
          const candidate = match
            ? candidates.find(item => item.slug === match.candidate.slug)
            : null;
          if (candidate) {
            return {
              animeId: anime.id,
              providerId: 'aniwaves',
              externalKey: candidate.slug,
              sourceTitle: candidate.title,
              sourceUrl: candidate.url
            };
          }
        } catch {
          // Se intenta el siguiente alias local.
        }
      }
      return null;
    },
    async getEpisodes(binding) {
      if (!/^\d+$/.test(binding.externalKey)) throw new Error('Identificador externo inválido.');
      const sourceUrl = getAllowedUrl(binding.sourceUrl, ['aniwaves.ru']);
      if (!sourceUrl) throw new Error('La asociación guardada contiene una URL no permitida.');
      const response = await http.get(`${baseUrl}/ajax/episode/list/${binding.externalKey}`, {
        headers: { 'User-Agent': SOURCE_USER_AGENT, Referer: sourceUrl }
      });
      const html = response.data?.result;
      if (response.data?.status !== 200 || typeof html !== 'string') {
        throw new Error('Aniwaves no devolvió una lista de episodios válida.');
      }
      return parseAniwavesEpisodes(html, baseUrl, binding.externalKey);
    },
    async getServers(binding, episode) {
      const sourceUrl = getAllowedUrl(binding.sourceUrl, ['aniwaves.ru']);
      const episodeUrl = getAllowedUrl(episode.url, ['aniwaves.ru']);
      if (!sourceUrl || !episodeUrl) {
        throw new Error('La asociación del episodio contiene una URL no permitida.');
      }
      const listUrl = `${baseUrl}/ajax/server/list?servers=${encodeURIComponent(binding.externalKey)}&eps=${encodeURIComponent(String(episode.number))}`;
      const listResponse = await http.get(listUrl, {
        headers: { 'User-Agent': SOURCE_USER_AGENT, Referer: sourceUrl }
      });
      const html = listResponse.data?.result;
      if (listResponse.data?.status !== 200 || typeof html !== 'string') {
        throw new Error('Aniwaves no devolvió servidores para este episodio.');
      }

      const $ = cheerio.load(html);
      const serverItems = $('li[data-link-id], li[data-id]').toArray().slice(0, MAX_SERVERS_PER_EPISODE);
      const variants: Record<string, RawEpisodeServer[]> = {};
      for (const node of serverItems) {
        const element = $(node);
        const linkId = element.attr('data-link-id') || element.attr('data-id');
        if (!linkId || linkId.length > 4096) continue;
        const variantHint = element.closest('.type[data-type]').attr('data-type') || 'sub';
        const variant = /dub/i.test(variantHint) ? 'DUB' : 'SUB';
        try {
          const sourceResponse = await http.get(
            `${baseUrl}/ajax/sources?id=${encodeURIComponent(linkId)}`,
            {
              headers: {
                'User-Agent': SOURCE_USER_AGENT,
                Referer: sourceUrl,
                'X-Requested-With': 'XMLHttpRequest'
              }
            }
          );
          const url = getAnySafeHttpUrl(sourceResponse.data?.result?.url);
          const playbackMode = getExternalServerPlaybackMode(url);
          if (!url || !playbackMode || sourceResponse.data?.status !== 200) continue;
          const sourceLabel = element.text().replace(/\s+/g, ' ').trim();
          const server = String(
            sourceLabel
            || sourceResponse.data?.result?.server
            || getServerNameFromUrl(url)
          ).replace(/\s+/g, ' ').trim().slice(0, 80);
          (variants[variant] ||= []).push({ server, url, playbackMode });
        } catch {
          // Un servidor caído no invalida los demás.
        }
      }

      return { referer: episodeUrl, variants };
    }
  };
}

function createAniwatchProvider(http: SourceHttpClient): ExternalEpisodeProvider {
  const baseUrl = 'https://aniwatch.co.at';
  return {
    descriptor: {
      id: 'aniwatch',
      label: 'Aniwatch',
      language: 'en',
      baseUrl,
      stability: 'beta'
    },
    async findSeries(anime) {
      const aliases = getAliases(anime);
      for (const alias of aliases) {
        try {
          const page = await getPage(http, `${baseUrl}/?s=${encodeURIComponent(alias)}`, baseUrl);
          const $ = cheerio.load(page.html);
          const candidates: Array<{ slug: string; title: string; url: string }> = [];
          $('a.dynamic-name[href]').each((index, node) => {
            const link = $(node);
            const href = link.attr('href');
            const title = link.text().replace(/\s+/g, ' ').trim();
            if (!href || !title) return;
            const url = resolveAllowedUrl(href, baseUrl, ['aniwatch.co.at']);
            if (url) candidates.push({ slug: String(index), title, url });
          });
          const match = findBestAnimeTitleMatch(aliases, candidates);
          const candidate = match
            ? candidates.find(item => item.slug === match.candidate.slug)
            : null;
          if (!candidate) continue;

          const episodePage = await getPage(http, candidate.url, baseUrl);
          const animeId = episodePage.html.match(/["']anime_id["']\s*:\s*["'](\d+)["']/i)?.[1]
            || episodePage.html.match(/\banimeId\s*=\s*["']?(\d+)/i)?.[1];
          if (!animeId) continue;
          return {
            animeId: anime.id,
            providerId: 'aniwatch',
            externalKey: animeId,
            sourceTitle: candidate.title,
            sourceUrl: candidate.url
          };
        } catch {
          // Se intenta el siguiente alias local.
        }
      }
      return null;
    },
    async getEpisodes(binding) {
      if (!/^\d+$/.test(binding.externalKey)) throw new Error('Identificador externo inválido.');
      const sourceUrl = getAllowedUrl(binding.sourceUrl, ['aniwatch.co.at']);
      if (!sourceUrl) throw new Error('La asociación guardada contiene una URL no permitida.');
      const response = await http.get(
        `${baseUrl}/wp-json/hianime/v1/episode/list/${binding.externalKey}`,
        { headers: { 'User-Agent': SOURCE_USER_AGENT, Referer: sourceUrl } }
      );
      if (!response.data?.status || typeof response.data?.html !== 'string') {
        throw new Error('Aniwatch no devolvió una lista de episodios válida.');
      }
      return parseAniwatchEpisodes(response.data.html, baseUrl);
    },
    async getServers(binding, episode) {
      if (!/^\d+$/.test(episode.id)) throw new Error('Identificador de episodio inválido.');
      const sourceUrl = getAllowedUrl(binding.sourceUrl, ['aniwatch.co.at']);
      const episodeUrl = getAllowedUrl(episode.url, ['aniwatch.co.at']);
      if (!sourceUrl || !episodeUrl) {
        throw new Error('La asociación del episodio contiene una URL no permitida.');
      }
      const response = await http.get(
        `${baseUrl}/wp-json/hianime/v1/episode/servers/${episode.id}`,
        { headers: { 'User-Agent': SOURCE_USER_AGENT, Referer: episodeUrl } }
      );
      if (!response.data?.status || typeof response.data?.html !== 'string') {
        throw new Error('Aniwatch no devolvió servidores para este episodio.');
      }
      return {
        referer: episodeUrl,
        variants: parseAniwatchServers(response.data.html)
      };
    }
  };
}

export type ExternalEpisodeProviderRegistry = ReadonlyMap<
  ExternalEpisodeProviderId,
  ExternalEpisodeProvider
>;

export function createExternalEpisodeProviderRegistry(
  http: SourceHttpClient = axios.create({ timeout: 12_000, maxContentLength: 8_000_000 })
): ExternalEpisodeProviderRegistry {
  const animepaheResolver = createAnimepaheSeriesResolver();
  const providers: ExternalEpisodeProvider[] = [
    createWordPressProvider({
      id: 'gogoanime',
      label: 'Gogoanime',
      baseUrl: 'https://gogoanime.by',
      resolveSeries: resolveGogoanimeSeries
    }, http),
    createWordPressProvider({
      id: 'animepahe',
      label: 'Animepahe',
      baseUrl: 'https://animepahe.ch',
      resolveSeries: animepaheResolver
    }, http),
    createAniwavesProvider(http),
    createAniwatchProvider(http)
  ];

  return new Map(providers.map(provider => [provider.descriptor.id, provider]));
}

export function hasExternalEpisodeServers(result: ExternalEpisodeServers): boolean {
  return Object.values(result.variants).some(servers => servers.length > 0);
}
