import axios from 'axios';
import { query } from '../database/db';
import {
  normalizeAniListMedia,
  normalizeAniListRelations,
  normalizeAnimeStatus,
  normalizeAnimeType
} from './animeNormalization';
import type {
  ExternalSearchOptions,
  ExternalSearchPage,
  NormalizedAnime
} from './animeTypes';
import {
  findBestAnimeTitleMatch
} from './animeTitleMatching';

export { normalizeAniListRelations };
export type { ExternalSearchOptions, ExternalSearchPage, NormalizedAnime };

// Simplificar títulos para aumentar coincidencia de scraping
export function simplifyTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(season|part|tv|ova|ona|movie|special|capitulo|capitulos)\s*\d*\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper para pausar ejecuciones (respetar rate limit)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Registrar log de scraping en base de datos
export async function logScraping(source: string, action: string, status: string, message: string) {
  try {
    await query.run(`
      INSERT INTO scraping_logs (source, action, status, message)
      VALUES (?, ?, ?, ?)
    `, [source, action, status, message]);
  } catch (err) {
    console.error('Error al guardar log de scraping:', err);
  }
}

// --- INTEGRACIÓN CON ANILIST (GRAPHQL) ---
export async function searchAniListPage(
  searchQuery: string,
  options: ExternalSearchOptions = {}
): Promise<ExternalSearchPage> {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const perPage = Math.min(50, Math.max(1, Math.floor(Number(options.perPage) || 10)));
  const url = 'https://graphql.anilist.co';
  const graphQLQuery = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page (page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
          perPage
        }
        media (search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          description
          seasonYear
          season
          status
          format
          episodes
          duration
          averageScore
          popularity
          coverImage {
            large
          }
          bannerImage
          studios(isMain: true) {
            nodes {
              name
            }
          }
          source
          genres
          isAdult
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          relations {
            edges {
              relationType
              node {
                id
                title {
                  romaji
                  english
                  native
                }
                format
                type
                status
                coverImage {
                  large
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    await logScraping('AniList API', `Buscar: "${searchQuery}" página ${page}`, 'started', 'Iniciando búsqueda externa');
    const response = await axios.post(url, {
      query: graphQLQuery,
      variables: { search: searchQuery, page, perPage }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MapleVault-Local-Client'
      }
    });

    const pageInfo = response.data?.data?.Page?.pageInfo || {};
    const mediaList = response.data?.data?.Page?.media || [];
    const results: NormalizedAnime[] = mediaList.map(normalizeAniListMedia);

    const total = Number(pageInfo.total) || results.length;
    const totalPages = Number(pageInfo.lastPage) || Math.max(1, Math.ceil(total / perPage));
    await logScraping('AniList API', `Buscar: "${searchQuery}" página ${page}`, 'success', `Encontrados ${results.length} resultados`);
    return {
      items: results,
      page: Number(pageInfo.currentPage) || page,
      pageSize: Number(pageInfo.perPage) || perPage,
      total,
      totalPages,
      hasNextPage: Boolean(pageInfo.hasNextPage),
      available: true
    };
  } catch (err: any) {
    const errorMsg = err.response?.data?.errors?.[0]?.message || err.message;
    await logScraping('AniList API', `Buscar: "${searchQuery}" página ${page}`, 'error', `Fallo: ${errorMsg}`);
    console.error('Error al consultar AniList API:', errorMsg);
    return {
      items: [],
      page,
      pageSize: perPage,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      available: false
    };
  }
}

export async function searchAniList(searchQuery: string): Promise<NormalizedAnime[]> {
  return (await searchAniListPage(searchQuery)).items;
}

export async function getAniListAnimeById(externalId: number): Promise<NormalizedAnime | null> {
  const graphQLQuery = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        description
        seasonYear
        season
        status
        format
        episodes
        duration
        averageScore
        popularity
        coverImage { large }
        bannerImage
        studios(isMain: true) { nodes { name } }
        source
        genres
        isAdult
        siteUrl
        startDate { year month day }
        endDate { year month day }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english native }
              format
              type
              status
              coverImage { large }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: graphQLQuery,
      variables: { id: externalId }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MapleVault-Local-Client'
      },
      timeout: 8000
    });

    const media = response.data?.data?.Media;
    return media ? normalizeAniListMedia(media) : null;
  } catch (err: any) {
    const errorMsg = err.response?.data?.errors?.[0]?.message || err.message;
    console.error('Error al consultar una ficha de AniList:', errorMsg);
    return null;
  }
}

// --- SINCRONIZACIÓN POR AÑO Y TEMPORADA DESDE ANILIST ---
export async function syncSeasonFromAniList(year: number, season: string): Promise<NormalizedAnime[]> {
  const url = 'https://graphql.anilist.co';
  const graphQLQuery = `
    query ($year: Int, $season: MediaSeason, $page: Int) {
      Page (page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        media (seasonYear: $year, season: $season, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          description
          seasonYear
          season
          status
          format
          episodes
          duration
          averageScore
          popularity
          coverImage {
            large
          }
          bannerImage
          studios(isMain: true) {
            nodes {
              name
            }
          }
          source
          genres
          isAdult
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          relations {
            edges {
              relationType
              node {
                id
                title {
                  romaji
                  english
                  native
                }
                format
                type
                status
                coverImage {
                  large
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const seasonUpper = season.toUpperCase(); // AniList usa WINTER, SPRING, SUMMER, FALL
    await logScraping('AniList API', `Sincronizar temporada: ${year} ${season}`, 'started', `Iniciando sincronización para ${year}-${season}`);

    const mediaById = new Map<number, any>();
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && page <= 10) {
      try {
        const response = await axios.post(url, {
          query: graphQLQuery,
          variables: { year, season: seasonUpper, page }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'MapleVault-Local-Client'
          },
          timeout: 8000,
          maxRedirects: 0
        });

        const pageData = response.data?.data?.Page;
        const mediaList = Array.isArray(pageData?.media) ? pageData.media : [];
        for (const media of mediaList) {
          if (Number.isInteger(Number(media?.id))) {
            mediaById.set(Number(media.id), media);
          }
        }

        hasNextPage = pageData?.pageInfo?.hasNextPage === true;
        page += 1;
      } catch (error) {
        if (mediaById.size === 0) throw error;
        console.warn(`AniList no respondió al solicitar la página ${page}; se conservarán ${mediaById.size} resultados parciales.`);
        break;
      }
    }

    const results: NormalizedAnime[] = Array.from(mediaById.values()).map(normalizeAniListMedia);

    await logScraping('AniList API', `Sincronizar temporada: ${year} ${season}`, 'success', `Sincronizados ${results.length} animes de la temporada`);
    return results;
  } catch (err: any) {
    const errorMsg = err.response?.data?.errors?.[0]?.message || err.message;
    await logScraping('AniList API', `Sincronizar temporada: ${year} ${season}`, 'error', `Fallo: ${errorMsg}`);
    console.error('Error al sincronizar temporada:', errorMsg);
    return [];
  }
}

// --- BÚSQUEDA EN JIKAN API (MYANIMELIST FALLBACK) ---
export async function searchJikanPage(
  searchQuery: string,
  options: ExternalSearchOptions = {}
): Promise<ExternalSearchPage> {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const perPage = Math.min(25, Math.max(1, Math.floor(Number(options.perPage) || 10)));
  try {
    await logScraping('Jikan API', `Buscar: "${searchQuery}" página ${page}`, 'started', 'Iniciando búsqueda en MyAnimeList');
    const response = await axios.get(`https://api.jikan.moe/v4/anime`, {
      params: { q: searchQuery, page, limit: perPage },
      headers: { 'User-Agent': 'MapleVault-Local-Client' }
    });

    const dataList = response.data?.data || [];
    const results: NormalizedAnime[] = dataList.map((m: any) => {
      // Fechas
      const start = m.aired?.from ? m.aired.from.split('T')[0] : undefined;
      const end = m.aired?.to ? m.aired.to.split('T')[0] : undefined;

      return {
        external_id: m.mal_id,
        source: 'MyAnimeList',
        title: m.title_english || m.title,
        title_romaji: m.title,
        title_english: m.title_english,
        title_japanese: m.title_japanese,
        synopsis: m.synopsis,
        year: m.year || (m.aired?.prop?.from?.year) || undefined,
        season: m.season ? m.season.toLowerCase() : undefined,
        status: normalizeAnimeStatus(m.status),
        type: normalizeAnimeType(m.type || 'tv'),
        episodes: m.episodes,
        duration: m.duration ? parseInt(m.duration) : undefined,
        score: m.score,
        popularity: m.members,
        cover_image: m.images?.jpg?.large_image_url || m.images?.jpg?.image_url,
        studio: m.studios?.[0]?.name,
        source_material: m.source ? m.source.toLowerCase() : undefined,
        start_date: start,
        end_date: end,
        genres: m.genres?.map((g: any) => g.name) || []
      };
    });

    const pagination = response.data?.pagination || {};
    const total = Number(pagination.items?.total) || results.length;
    const totalPages = Number(pagination.last_visible_page) || Math.max(1, Math.ceil(total / perPage));
    await logScraping('Jikan API', `Buscar: "${searchQuery}" página ${page}`, 'success', `Encontrados ${results.length} resultados`);
    return {
      items: results,
      page: Number(pagination.current_page) || page,
      pageSize: perPage,
      total,
      totalPages,
      hasNextPage: Boolean(pagination.has_next_page),
      available: true
    };
  } catch (err: any) {
    await logScraping('Jikan API', `Buscar: "${searchQuery}" página ${page}`, 'error', `Fallo: ${err.message}`);
    console.error('Error al consultar Jikan API:', err.message);
    return {
      items: [],
      page,
      pageSize: perPage,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      available: false
    };
  }
}

export async function searchJikan(searchQuery: string): Promise<NormalizedAnime[]> {
  return (await searchJikanPage(searchQuery)).items;
}

// --- INTEGRAR ANIME NORMALIZADO A LA BASE DE DATOS LOCAL ---
export async function saveNormalizedAnimeToLocal(anime: NormalizedAnime): Promise<number> {
  const animeYear = anime.year || null;
  const originalSynopsis = String((anime as any).synopsis_original || anime.synopsis || '').trim();

  // Comprobar si ya existe por external_id o título (o alguna de sus variantes) y año idénticos
  let existing = await query.get(
    `SELECT id FROM anime WHERE 
      (external_id = ? AND source = ?) OR 
      (LOWER(title) = LOWER(?) AND (year = ? OR year IS NULL OR ? IS NULL)) OR
      (title_romaji IS NOT NULL AND LOWER(title_romaji) = LOWER(?) AND (year = ? OR year IS NULL OR ? IS NULL)) OR
      (title_english IS NOT NULL AND LOWER(title_english) = LOWER(?) AND (year = ? OR year IS NULL OR ? IS NULL)) LIMIT 1`,
    [
      anime.external_id, anime.source,
      anime.title, animeYear, animeYear,
      anime.title_romaji || '', animeYear, animeYear,
      anime.title_english || '', animeYear, animeYear
    ]
  );

  // Determinar si es adulto (+18 / Hentai)
  const isAdult = (anime.genres && anime.genres.some(g => g.toLowerCase() === 'hentai' || g.toLowerCase() === 'erotica')) ||
                  (anime.age_rating && (anime.age_rating.toLowerCase().includes('rx') || anime.age_rating.toLowerCase().includes('18+') || anime.age_rating.toLowerCase().includes('hentai'))) ||
                  anime.is_adult === 1 ? 1 : 0;

  let animeId: number;

  if (existing) {
    animeId = existing.id;
    // Actualizar metadatos
    await query.run(`
      UPDATE anime
      SET title_romaji = ?, title_english = ?, title_japanese = ?, synopsis = ?,
          status = ?, type = ?, episodes = ?, duration = ?, score = ?, popularity = ?,
          cover_image = ?, banner_image = ?, studio = ?, source_material = ?,
          start_date = ?, end_date = ?, is_adult = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      anime.title_romaji, anime.title_english, anime.title_japanese, originalSynopsis,
      anime.status, anime.type, anime.episodes, anime.duration, anime.score, anime.popularity,
      anime.cover_image, anime.banner_image, anime.studio, anime.source_material,
      anime.start_date, anime.end_date, isAdult, animeId
    ]);
  } else {
    // Insertar nuevo
    const res = await query.run(`
      INSERT INTO anime (
        external_id, source, title, title_romaji, title_english, title_japanese, synopsis,
        year, season, status, type, episodes, duration, score, popularity,
        cover_image, banner_image, studio, source_material, start_date, end_date, is_adult
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      anime.external_id, anime.source, anime.title, anime.title_romaji, anime.title_english, anime.title_japanese, originalSynopsis,
      anime.year, anime.season, anime.status, anime.type, anime.episodes, anime.duration, anime.score, anime.popularity,
      anime.cover_image, anime.banner_image, anime.studio, anime.source_material, anime.start_date, anime.end_date, isAdult
    ]);
    animeId = res.lastID;
  }

  // Guardar géneros
  for (const genreName of anime.genres) {
    await query.run('INSERT OR IGNORE INTO genres (name) VALUES (?)', [genreName]);
    const genreRow = await query.get('SELECT id FROM genres WHERE name = ?', [genreName]);
    if (genreRow) {
      await query.run('INSERT OR IGNORE INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [animeId, genreRow.id]);
    }
  }

  // Guardar relaciones (precuelas, secuelas, películas)
  if (anime.relations && Array.isArray(anime.relations)) {
    await query.run('DELETE FROM anime_relations WHERE anime_id = ?', [animeId]);
    for (const rel of anime.relations) {
      await query.run(`
        INSERT OR IGNORE INTO anime_relations (
          anime_id, related_external_id, relation_type, title, format, type, status, cover_image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        animeId, rel.related_external_id, rel.relation_type, rel.title,
        rel.format, rel.type, rel.status, rel.cover_image
      ]);
    }
  }

  return animeId;
}

// --- SCRAPING Y ENLACES DE ANIMEAV1 ---

// Deserializador de formato SvelteKit devalue
function deserializeSvelteKit(index: number, flatArray: any[], cache = new Map()): any {
  if (cache.has(index)) return cache.get(index);
  const val = flatArray[index];
  if (val === null || val === undefined) return val;
  
  if (Array.isArray(val)) {
    const res: any[] = [];
    cache.set(index, res);
    for (const itemIndex of val) {
      res.push(deserializeSvelteKit(itemIndex, flatArray, cache));
    }
    return res;
  }
  
  if (typeof val === 'object') {
    const res: any = {};
    cache.set(index, res);
    for (const key in val) {
      res[key] = deserializeSvelteKit(val[key], flatArray, cache);
    }
    return res;
  }
  
  return val;
}

// Obtener slug de AnimeAV1 buscando en el catálogo por título(s)
export async function getAnimeAV1Slug(title: string, romaji?: string, english?: string): Promise<string | null> {
  const aliases = [title, romaji, english]
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
  const queries = [...new Set(aliases)];
  
  const simplified = simplifyTitle(title);
  if (simplified && !queries.includes(simplified)) {
    queries.push(simplified);
  }

  const candidatesBySlug = new Map<string, { slug: string; title: string }>();
  
  for (const q of queries) {
    try {
      await logScraping('AnimeAV1 Scraping', `Buscar slug para: "${q}"`, 'started', `Iniciando búsqueda de slug en AnimeAV1`);
      const url = `https://animeav1.com/catalogo?search=${encodeURIComponent(q)}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });
      
      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);
      let extractedFromArticles = 0;
      
      $('article').each((_: any, el: any) => {
        const link = $(el).find('a').filter((idx: any, aEl: any) => {
          const href = $(aEl).attr('href');
          return !!(href && href.startsWith('/media/') && href.split('/').length === 3);
        }).first();
        const href = link.attr('href');
        if (!href) return;

        const slug = href.split('/')[2];
        const heading = $(el).find('h1, h2, h3, h4, [class*="title"]').first().text().trim();
        const imageAlt = ($(el).find('img').first().attr('alt') || '')
          .replace(/^portada\s+de\s+/i, '')
          .trim();
        const candidateTitle = heading || imageAlt;
        if (slug && candidateTitle) {
          candidatesBySlug.set(slug, { slug, title: candidateTitle });
          extractedFromArticles += 1;
        }
      });

      if (extractedFromArticles === 0) {
        $('a').each((_: any, el: any) => {
          const href = $(el).attr('href');
          if (href && href.startsWith('/media/')) {
            const parts = href.split('/');
            if (parts.length === 3) {
              const slug = parts[2];
              const candidateTitle = ($(el).attr('title') || $(el).text()).trim();
              if (slug && candidateTitle) {
                candidatesBySlug.set(slug, { slug, title: candidateTitle });
              }
            }
          }
        });
      }
      
      const match = findBestAnimeTitleMatch(aliases, [...candidatesBySlug.values()]);
      if (match?.score === 1) {
        await logScraping(
          'AnimeAV1 Scraping',
          `Buscar slug para: "${q}"`,
          'success',
          `Coincidencia exacta: ${match.candidate.title} (${match.candidate.slug})`
        );
        return match.candidate.slug;
      }
    } catch (err: any) {
      await logScraping('AnimeAV1 Scraping', `Buscar slug para: "${q}"`, 'error', `Fallo al buscar: ${err.message}`);
      console.error(`Error buscando slug en AnimeAV1 para "${q}":`, err.message);
    }
  }

  const match = findBestAnimeTitleMatch(aliases, [...candidatesBySlug.values()]);
  if (match) {
    await logScraping(
      'AnimeAV1 Scraping',
      `Buscar slug para: "${title}"`,
      'success',
      `Coincidencia validada: ${match.candidate.title} (${match.candidate.slug}, ${match.score.toFixed(2)})`
    );
    return match.candidate.slug;
  }

  await logScraping(
    'AnimeAV1 Scraping',
    `Buscar slug para: "${title}"`,
    'error',
    'No se encontró una coincidencia de título segura'
  );
  return null;
}

export interface AnimeAV1MediaData {
  title: string;
  slug: string;
  episodes: { id: number; number: number }[];
}

export function extractAnimeAV1MediaData(data: any, fallbackSlug: string): AnimeAV1MediaData {
  if (!data || !Array.isArray(data.nodes)) {
    throw new Error('Formato SvelteKit no reconocido');
  }

  for (const node of data.nodes) {
    if (!node || node.type !== 'data' || !Array.isArray(node.data)) continue;
    const root = deserializeSvelteKit(0, node.data);
    if (!root?.media) continue;

    const media = root.media;
    const episodes = Array.isArray(media.episodes)
      ? media.episodes
        .map((episode: any) => ({
          id: Number(episode.id),
          number: Number(episode.number)
        }))
        .filter((episode: { id: number; number: number }) =>
          Number.isFinite(episode.id) && Number.isFinite(episode.number)
        )
        .sort((left: { number: number }, right: { number: number }) => left.number - right.number)
      : [];

    return {
      title: String(media.title || '').trim(),
      slug: String(media.slug || fallbackSlug).trim(),
      episodes
    };
  }

  throw new Error('AnimeAV1 no devolvió metadata de la serie');
}

export async function getAnimeAV1Media(slug: string): Promise<AnimeAV1MediaData> {
  const url = `https://animeav1.com/media/${encodeURIComponent(slug)}/__data.json`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    },
    timeout: 8000
  });
  return extractAnimeAV1MediaData(response.data, slug);
}

// Obtener la lista de episodios de un anime por su slug
export async function getAnimeAV1Episodes(slug: string): Promise<{ id: number, number: number }[]> {
  try {
    await logScraping('AnimeAV1 Scraping', `Obtener episodios para slug: "${slug}"`, 'started', `Solicitando __data.json del catálogo`);
    const { episodes } = await getAnimeAV1Media(slug);
    await logScraping('AnimeAV1 Scraping', `Obtener episodios para slug: "${slug}"`, 'success', `Encontrados ${episodes.length} episodios`);
    return episodes;
  } catch (err: any) {
    await logScraping('AnimeAV1 Scraping', `Obtener episodios para slug: "${slug}"`, 'error', `Fallo al obtener episodios: ${err.message}`);
    console.error(`Error obteniendo episodios de AnimeAV1 para "${slug}":`, err.message);
    throw err;
  }
}

// Obtener los reproductores (embeds) de un episodio por su slug y número de capítulo
export async function getAnimeAV1Embeds(slug: string, number: number): Promise<any> {
  try {
    await logScraping('AnimeAV1 Scraping', `Obtener embeds: ${slug} cap ${number}`, 'started', `Solicitando __data.json del episodio`);
    const url = `https://animeav1.com/media/${slug}/${number}/__data.json`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    
    const data = response.data;
    if (!data || !data.nodes || !Array.isArray(data.nodes)) {
      throw new Error('Formato SvelteKit no reconocido');
    }
    
    // Buscar el nodo que contiene los embeds
    let embeds: any = {};
    for (const node of data.nodes) {
      if (node && node.type === 'data' && Array.isArray(node.data)) {
        const root = deserializeSvelteKit(0, node.data);
        if (root && root.embeds) {
          embeds = root.embeds;
          break;
        }
      }
    }
    
    await logScraping('AnimeAV1 Scraping', `Obtener embeds: ${slug} cap ${number}`, 'success', `Obtenidos servidores de reproducción`);
    return embeds;
  } catch (err: any) {
    await logScraping('AnimeAV1 Scraping', `Obtener embeds: ${slug} cap ${number}`, 'error', `Fallo al obtener embeds: ${err.message}`);
    console.error(`Error obteniendo embeds de AnimeAV1 para "${slug}" capítulo ${number}:`, err.message);
    throw err;
  }
}


// ==========================================
// TIOANIME SCRAPER — Fuente de episodios alternativa
// ==========================================

const TIOANIME_BASE = 'https://tioanime.com';
const TIO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Busca un slug de TioAnime buscando por título.
 */
export async function getTioAnimeSlug(title: string, romaji?: string, english?: string): Promise<string | null> {
  const queries = [title, romaji, english].filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
  
  const simplified = simplifyTitle(title);
  if (simplified && !queries.includes(simplified)) {
    queries.push(simplified);
  }
  
  for (const q of queries) {
    try {
      const url = `${TIOANIME_BASE}/directorio?q=${encodeURIComponent(q)}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': TIO_UA },
        timeout: 8000
      });

      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);
      
      let slug: string | null = null;
      
      $('a[href*="/anime/"]').each((_: any, el: any) => {
        if (slug) return;
        const href = $(el).attr('href') || '';
        const parts = href.split('/anime/');
        if (parts[1]) {
          const candidate = parts[1].split('/')[0].split('?')[0];
          if (candidate && candidate.length > 2 && !candidate.includes('.')) {
            slug = candidate;
          }
        }
      });

      if (slug) {
        await logScraping('TioAnime', `Slug para: "${q}"`, 'success', `Slug encontrado: ${slug}`);
        return slug;
      }
    } catch (err: any) {
      await logScraping('TioAnime', `Slug para: "${q}"`, 'error', err.message);
    }
  }
  return null;
}

/**
 * Obtiene los episodios de un anime en TioAnime dado su slug.
 */
export async function getTioAnimeEpisodes(slug: string): Promise<{ number: number; url: string }[]> {
  try {
    const animeUrl = `${TIOANIME_BASE}/anime/${slug}`;
    const response = await axios.get(animeUrl, {
      headers: { 'User-Agent': TIO_UA },
      timeout: 10000
    });

    const cheerio = require('cheerio');
    const $ = cheerio.load(response.data);
    
    const episodes: { number: number; url: string }[] = [];

    $('a[href*="/ver/"]').each((_: any, el: any) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/ver\/(.+)/);
      if (!match) return;

      const epSlug = match[1];
      const numMatch = epSlug.match(/[-_](\d+)$/);
      const epNum = numMatch ? parseInt(numMatch[1]) : null;
      
      if (epNum !== null && !episodes.find((e: any) => e.number === epNum)) {
        episodes.push({
          number: epNum,
          url: `${TIOANIME_BASE}/ver/${epSlug}`
        });
      }
    });

    // También buscar en scripts JS embebidos
    if (episodes.length === 0) {
      const scriptContent = $('script:not([src])').text();
      const episodesMatch = scriptContent.match(/episodes\s*=\s*\[([^\]]+)\]/);
      if (episodesMatch?.[1]) {
        const nums = episodesMatch[1].match(/\d+/g);
        if (nums) {
          nums.forEach((n: string) => {
            const num = parseInt(n);
            if (!episodes.find((e: any) => e.number === num)) {
              episodes.push({
                number: num,
                url: `${TIOANIME_BASE}/ver/${slug}-${num}`
              });
            }
          });
        }
      }
    }

    episodes.sort((a: any, b: any) => a.number - b.number);
    await logScraping('TioAnime', `Episodios para: "${slug}"`, 'success', `${episodes.length} episodios encontrados`);
    return episodes;
  } catch (err: any) {
    await logScraping('TioAnime', `Episodios para: "${slug}"`, 'error', err.message);
    throw err;
  }
}

/**
 * Obtiene los servidores de video de un episodio de TioAnime.
 */
export async function getTioAnimeServers(episodeUrl: string): Promise<{ server: string; url: string }[]> {
  try {
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': TIO_UA },
      timeout: 10000
    });

    const html: string = response.data;
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const servers: { server: string; url: string }[] = [];
    const scriptContent = $('script:not([src])').text();

    // TioAnime almacena videos en: var videos = [["Servidor","URL"],...]
    const videosMatch = scriptContent.match(/(?:var\s+)?videos\s*=\s*(\[[\s\S]*?\]);/);
    if (videosMatch?.[1]) {
      try {
        const parsed = JSON.parse(videosMatch[1]);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (Array.isArray(item) && item.length >= 2) {
              servers.push({ server: String(item[0]), url: String(item[1]) });
            } else if (typeof item === 'object' && item.server && item.url) {
              servers.push({ server: String(item.server), url: String(item.url) });
            }
          });
        }
      } catch (_) {
        const pairMatches = videosMatch[1].matchAll(/\["([^"]+)"\s*,\s*"([^"]+)"\]/g);
        for (const m of pairMatches) {
          servers.push({ server: m[1], url: m[2] });
        }
      }
    }

    // Fallback: iframes embebidos
    if (servers.length === 0) {
      $('iframe[src]').each((_: any, el: any) => {
        const src = $(el).attr('src') || '';
        if (src.startsWith('http')) {
          try {
            const domain = new URL(src).hostname.replace('www.', '');
            servers.push({ server: domain, url: src });
          } catch (_) {}
        }
      });
    }

    await logScraping('TioAnime', `Servidores para: ${episodeUrl}`, 'success', `${servers.length} servidores encontrados`);
    return servers;
  } catch (err: any) {
    await logScraping('TioAnime', `Servidores para: ${episodeUrl}`, 'error', err.message);
    throw err;
  }
}

// ==========================================
// ANIMEFLV SCRAPER
// ==========================================

export async function getAnimeFLVSlug(title: string, romaji?: string, english?: string): Promise<string | null> {
  const queries = [title, romaji, english].filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
  
  const simplified = simplifyTitle(title);
  if (simplified && !queries.includes(simplified)) {
    queries.push(simplified);
  }

  for (const q of queries) {
    try {
      await logScraping('AnimeFLV', `Buscar slug para: "${q}"`, 'started', `Buscando en AnimeFLV`);
      const url = `https://www3.animeflv.net/browse?q=${encodeURIComponent(q)}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': TIO_UA },
        timeout: 8000
      });
      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);
      let slug: string | null = null;
      
      $('ul.ListAnimes li article.Anime a, ul.UlAnimes li a, .Anime a').each((_: any, el: any) => {
        if (slug) return;
        const href = $(el).attr('href') || '';
        if (href.startsWith('/anime/')) {
          slug = href.split('/anime/')[1];
        }
      });

      if (slug) {
        await logScraping('AnimeFLV', `Buscar slug para: "${q}"`, 'success', `Slug encontrado: ${slug}`);
        return slug;
      }
    } catch (err: any) {
      await logScraping('AnimeFLV', `Buscar slug para: "${q}"`, 'error', err.message);
    }
  }
  return null;
}

export async function getAnimeFLVEpisodes(slug: string): Promise<{ number: number; url: string }[]> {
  try {
    const url = `https://www3.animeflv.net/anime/${slug}`;
    await logScraping('AnimeFLV', `Obtener episodios para: "${slug}"`, 'started', `Cargando detalles de AnimeFLV`);
    const response = await axios.get(url, {
      headers: { 'User-Agent': TIO_UA },
      timeout: 8000
    });
    const html = response.data;
    const match = html.match(/var episodes = (\[.*?\]);/);
    const episodes: { number: number; url: string }[] = [];
    
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (Array.isArray(item) && item.length >= 2) {
              const num = item[0];
              episodes.push({
                number: num,
                url: `https://www3.animeflv.net/ver/${slug}-${num}`
              });
            }
          });
        }
      } catch (_) {}
    }

    if (episodes.length === 0) {
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);
      $('ul.ListEpisodes li a').each((_: any, el: any) => {
        const href = $(el).attr('href') || '';
        const matchEp = href.match(/\/ver\/(.+)-(\d+)$/);
        if (matchEp) {
          episodes.push({
            number: parseInt(matchEp[2]),
            url: `https://www3.animeflv.net${href}`
          });
        }
      });
    }

    episodes.sort((a, b) => a.number - b.number);
    await logScraping('AnimeFLV', `Obtener episodios para: "${slug}"`, 'success', `Encontrados ${episodes.length} episodios`);
    return episodes;
  } catch (err: any) {
    await logScraping('AnimeFLV', `Obtener episodios para: "${slug}"`, 'error', err.message);
    throw err;
  }
}

export async function getAnimeFLVServers(episodeUrl: string): Promise<{ server: string; url: string }[]> {
  try {
    await logScraping('AnimeFLV', `Obtener servidores para: "${episodeUrl}"`, 'started', `Cargando página de episodio`);
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': TIO_UA },
      timeout: 8000
    });
    const html = response.data;
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    const servers: { server: string; url: string }[] = [];
    
    // var videos (reproductores)
    const matchVideos = html.match(/var videos = (\{.*?\});/);
    if (matchVideos?.[1]) {
      try {
        const parsed = JSON.parse(matchVideos[1]);
        const lists = parsed.SUB || parsed.LAT || Object.values(parsed)[0] || [];
        if (Array.isArray(lists)) {
          lists.forEach((item: any) => {
            if (item.server && item.code) {
              let url = item.code;
              if (!url.startsWith('http')) {
                if (item.server.toLowerCase() === 'mega') {
                  url = `https://mega.nz/embed#!${item.code}`;
                } else if (item.server.toLowerCase() === 'okru') {
                  url = `https://ok.ru/videoembed/${item.code}`;
                }
              }
              if (url.includes('mega.nz/embed/')) {
                url = url.replace('mega.nz/embed/', 'mega.nz/file/');
              }
              servers.push({
                server: item.server,
                url
              });
            }
          });
        }
      } catch (_) {}
    }

    // Tabla de descargas
    $('table.Downloads tbody tr').each((_: any, el: any) => {
      const serverName = $(el).find('td').eq(0).text().trim();
      const btn = $(el).find('a.Button');
      let href = btn.attr('href');
      if (serverName && href) {
        if (href.includes('mega.nz/embed/')) {
          href = href.replace('mega.nz/embed/', 'mega.nz/file/');
        }
        if (!servers.some(s => s.url === href)) {
          servers.push({
            server: serverName,
            url: href
          });
        }
      }
    });

    await logScraping('AnimeFLV', `Obtener servidores para: "${episodeUrl}"`, 'success', `Encontrados ${servers.length} servidores`);
    return servers;
  } catch (err: any) {
    await logScraping('AnimeFLV', `Obtener servidores para: "${episodeUrl}"`, 'error', err.message);
    throw err;
  }
}

// ==========================================
// JKANIME SCRAPER
// ==========================================

const JK_EXCLUDED = [
  'buscar', 'directorio', 'horario', 'genero', 'tipo', 'ver', 'herramientas', 'logo',
  'notificaciones', 'comunidad', 'aplicacion', 'historial', 'estrenos', 'top', 'perfil',
  'registro', 'login', 'logout', 'admin', 'guardado'
];

export async function getJKAnimeSlug(title: string, romaji?: string, english?: string): Promise<string | null> {
  const queries = [title, romaji, english].filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
  
  const simplified = simplifyTitle(title);
  if (simplified && !queries.includes(simplified)) {
    queries.push(simplified);
  }

  for (const q of queries) {
    try {
      await logScraping('JKAnime', `Buscar slug para: "${q}"`, 'started', `Buscando en JKAnime`);
      const url = `https://jkanime.net/buscar?q=${encodeURIComponent(q)}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': TIO_UA },
        timeout: 8000
      });
      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);
      let slug: string | null = null;

      $('div.anime__item a, div.card a, .anime__item a, .filtro-resultados a, article a, ul.ListAnimes li a').each((_: any, el: any) => {
        if (slug) return;
        const href = $(el).attr('href') || '';
        const match = href.match(/jkanime\.net\/([a-zA-Z0-9\-_]+)\/?$/);
        if (match) {
          const candidate = match[1];
          if (!JK_EXCLUDED.includes(candidate)) {
            slug = candidate;
          }
        }
      });

      if (slug) {
        await logScraping('JKAnime', `Buscar slug para: "${q}"`, 'success', `Slug encontrado: ${slug}`);
        return slug;
      }
    } catch (err: any) {
      await logScraping('JKAnime', `Buscar slug para: "${q}"`, 'error', err.message);
    }
  }
  return null;
}

export async function getJKAnimeEpisodes(slug: string): Promise<{ number: number; url: string }[]> {
  try {
    const detailUrl = `https://jkanime.net/${slug}/`;
    await logScraping('JKAnime', `Obtener episodios para: "${slug}"`, 'started', `Obteniendo detalles de JKAnime`);
    const detailResponse = await axios.get(detailUrl, {
      headers: { 'User-Agent': TIO_UA },
      timeout: 8000
    });
    
    const cheerio = require('cheerio');
    const $ = cheerio.load(detailResponse.data);
    
    // Obtener token CSRF y ID interno de anime
    const token = $('meta[name="csrf-token"]').attr('content');
    const html = detailResponse.data;
    const matchId = html.match(/ajax\/episodes\/(\d+)\//) || html.match(/ajax\/search_episode\/(\d+)\//) || html.match(/ajax\/votado\/(\d+)/);
    const animeId = matchId ? matchId[1] : null;

    let total = 0;

    // Intentar POST AJAX primero si tenemos token e ID
    if (token && animeId) {
      try {
        const ajaxUrl = `https://jkanime.net/ajax/episodes/${animeId}/1`;
        const setCookie = detailResponse.headers['set-cookie'];
        const cookies = setCookie ? setCookie.map(c => c.split(';')[0]).join('; ') : '';

        const response = await axios.post(ajaxUrl, `_token=${encodeURIComponent(token)}`, {
          headers: {
            'User-Agent': TIO_UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': detailUrl,
            'Cookie': cookies
          },
          timeout: 8000
        });

        if (response.data && response.data.total) {
          total = parseInt(response.data.total);
        }
      } catch (err: any) {
        console.warn('POST AJAX a JKAnime falló, usando fallback estático:', err.message);
      }
    }

    // Fallback: parsear dropdown de paginación
    if (total === 0) {
      const lastOption = $('.anime__pagination option').last().text();
      if (lastOption) {
        const matchTotal = lastOption.match(/-\s*(\d+)/);
        if (matchTotal) {
          total = parseInt(matchTotal[1]);
        }
      }
    }

    // Fallback de emergencia
    if (total === 0) {
      total = 12;
    }

    const episodes = [];
    for (let i = 1; i <= total; i++) {
      episodes.push({
        number: i,
        url: `https://jkanime.net/${slug}/${i}/`
      });
    }

    await logScraping('JKAnime', `Obtener episodios para: "${slug}"`, 'success', `Encontrados ${episodes.length} episodios`);
    return episodes;
  } catch (err: any) {
    await logScraping('JKAnime', `Obtener episodios para: "${slug}"`, 'error', err.message);
    throw err;
  }
}

export async function getJKAnimeServers(episodeUrl: string): Promise<{ server: string; url: string }[]> {
  try {
    await logScraping('JKAnime', `Obtener servidores para: "${episodeUrl}"`, 'started', `Cargando página de episodio`);
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': TIO_UA },
      timeout: 8000
    });
    const html = response.data;
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    const servers: { server: string; url: string }[] = [];
    
    // Buscar script de var servers = [...]
    let scriptText = '';
    $('script:not([src])').each((_: any, el: any) => {
      const text = $(el).text();
      if (text.includes('var servers = [')) {
        scriptText = text;
      }
    });
    
    const match = scriptText.match(/var servers = (\[.*?\]);/);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            if (item.remote && item.server) {
              try {
                let decodedUrl = Buffer.from(item.remote, 'base64').toString('utf8').trim();
                if (decodedUrl.includes('mega.nz/embed/')) {
                  decodedUrl = decodedUrl.replace('mega.nz/embed/', 'mega.nz/file/');
                }
                servers.push({
                  server: item.server,
                  url: decodedUrl
                });
              } catch (_) {}
            }
          });
        }
      } catch (_) {}
    }
    
    // Fallback: iframes en el DOM
    if (servers.length === 0) {
      $('iframe[src]').each((_: any, el: any) => {
        const src = $(el).attr('src') || '';
        if (src.startsWith('http')) {
          try {
            const domain = new URL(src).hostname.replace('www.', '');
            servers.push({ server: domain, url: src });
          } catch (_) {}
        }
      });
    }
    
    await logScraping('JKAnime', `Obtener servidores para: "${episodeUrl}"`, 'success', `Encontrados ${servers.length} servidores`);
    return servers;
  } catch (err: any) {
    await logScraping('JKAnime', `Obtener servidores para: "${episodeUrl}"`, 'error', err.message);
    throw err;
  }
}
