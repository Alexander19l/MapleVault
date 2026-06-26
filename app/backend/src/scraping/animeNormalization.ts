import type { NormalizedAnime } from './animeTypes';

const ALLOWED_ANIME_RELATION_TYPES = new Set(['PREQUEL', 'SEQUEL']);

export function normalizeAnimeStatus(status?: string | null): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('finish') || normalized === 'completed' || normalized === 'finished') {
    return 'finished';
  }
  if (normalized.includes('air') || normalized === 'releasing' || normalized === 'currently airing') {
    return 'airing';
  }
  if (normalized.includes('yet') || normalized === 'not_yet_released' || normalized === 'upcoming') {
    return 'upcoming';
  }
  if (normalized.includes('cancel')) return 'cancelled';
  return 'unknown';
}

export function normalizeAnimeType(type?: string | null): string {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'tv' || normalized === 'tv_special') return 'tv';
  if (normalized === 'movie') return 'movie';
  if (normalized === 'ova') return 'ova';
  if (normalized === 'ona') return 'ona';
  if (normalized === 'special') return 'special';
  return 'tv';
}

export function normalizeAniListRelations(
  edges: any[] = []
): NonNullable<NormalizedAnime['relations']> {
  return edges
    .filter(edge => {
      const relationType = String(edge?.relationType || '').toUpperCase();
      const mediaType = String(edge?.node?.type || '').toUpperCase();
      return ALLOWED_ANIME_RELATION_TYPES.has(relationType) && mediaType === 'ANIME';
    })
    .map(edge => {
      const node = edge.node;
      return {
        related_external_id: node.id,
        relation_type: String(edge.relationType).toUpperCase(),
        title: node.title?.english || node.title?.romaji || node.title?.native || 'Título no disponible',
        format: node.format,
        type: node.type,
        status: node.status ? normalizeAnimeStatus(node.status) : undefined,
        cover_image: node.coverImage?.large
      };
    });
}

export function normalizeAniListMedia(media: any): NormalizedAnime {
  const start = media.startDate?.year
    ? `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, '0')}-${String(media.startDate.day || 1).padStart(2, '0')}`
    : undefined;
  const end = media.endDate?.year
    ? `${media.endDate.year}-${String(media.endDate.month || 1).padStart(2, '0')}-${String(media.endDate.day || 1).padStart(2, '0')}`
    : undefined;

  return {
    external_id: media.id,
    source: 'AniList',
    title: media.title?.english || media.title?.romaji || media.title?.native || 'Título no disponible',
    title_romaji: media.title?.romaji,
    title_english: media.title?.english,
    title_japanese: media.title?.native,
    synopsis: media.description ? media.description.replace(/<\/?[^>]+(>|$)/g, '') : '',
    year: media.seasonYear,
    season: media.season ? media.season.toLowerCase() : undefined,
    status: normalizeAnimeStatus(media.status),
    type: normalizeAnimeType(media.format),
    episodes: media.episodes,
    duration: media.duration,
    score: media.averageScore ? media.averageScore / 10 : undefined,
    popularity: media.popularity,
    cover_image: media.coverImage?.large,
    banner_image: media.bannerImage,
    studio: media.studios?.nodes?.[0]?.name,
    source_material: media.source ? media.source.toLowerCase() : undefined,
    start_date: start,
    end_date: end,
    genres: media.genres || [],
    official_url: media.siteUrl,
    is_adult: media.isAdult ? 1 : 0,
    relations: normalizeAniListRelations(media.relations?.edges || [])
  };
}
