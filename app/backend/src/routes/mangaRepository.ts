import type { MangaListFilters, MangaRow } from '../manga/mangaTypes';

type QueryClient = {
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
};

const MAX_LIMIT = 100;

function normalizeLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function getSortSql(sort?: string): string {
  switch (sort) {
    case 'title_asc':
      return 'm.title COLLATE NOCASE ASC';
    case 'score_desc':
      return 'm.score DESC, m.popularity DESC, m.id DESC';
    case 'year_desc':
      return 'm.year DESC, m.popularity DESC, m.id DESC';
    case 'updated_desc':
      return 'm.updated_at DESC, m.id DESC';
    default:
      return 'm.popularity DESC, m.score DESC, m.id DESC';
  }
}

function buildWhere(filters: MangaListFilters): { whereSql: string; params: any[] } {
  const clauses = ['COALESCE(m.is_adult, 0) = 0'];
  const params: any[] = [];

  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    clauses.push('(m.title LIKE ? OR m.title_romaji LIKE ? OR m.title_english LIKE ? OR m.title_japanese LIKE ?)');
    params.push(q, q, q, q);
  }

  if (filters.status?.trim()) {
    clauses.push('m.status = ?');
    params.push(filters.status.trim());
  }

  if (filters.format?.trim()) {
    clauses.push('m.format = ?');
    params.push(filters.format.trim());
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function parseGenres(row: MangaRow & { genre_names?: string | null }): MangaRow {
  const { genre_names: genreNames, ...manga } = row;
  return {
    ...manga,
    genres: genreNames
      ? genreNames.split(',').map(genre => genre.trim()).filter(Boolean)
      : []
  };
}

export async function getMangaRows(
  queryClient: QueryClient,
  rawFilters: MangaListFilters
): Promise<{ rows: MangaRow[]; total?: number; limit: number; offset: number }> {
  const limit = normalizeLimit(rawFilters.limit);
  const offset = normalizeOffset(rawFilters.offset);
  const { whereSql, params } = buildWhere(rawFilters);
  const sortSql = getSortSql(rawFilters.sort);

  const rows = await queryClient.all(`
    SELECT
      m.*,
      mul.read_status,
      mul.favorite,
      mul.user_score,
      mul.chapters_read,
      mul.volumes_read,
      mul.notes,
      GROUP_CONCAT(g.name) as genre_names
    FROM manga m
    LEFT JOIN manga_user_list mul ON mul.manga_id = m.id
    LEFT JOIN manga_genres mg ON mg.manga_id = m.id
    LEFT JOIN genres g ON g.id = mg.genre_id
    ${whereSql}
    GROUP BY m.id
    ORDER BY ${sortSql}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  let total: number | undefined;
  if (rawFilters.withTotal) {
    const totalRow = await queryClient.get(`
      SELECT COUNT(*) as total
      FROM manga m
      ${whereSql}
    `, params);
    total = totalRow?.total || 0;
  }

  return {
    rows: rows.map(parseGenres),
    total,
    limit,
    offset
  };
}

export async function getMangaById(queryClient: QueryClient, id: number): Promise<MangaRow | null> {
  const row = await queryClient.get(`
    SELECT
      m.*,
      mul.read_status,
      mul.favorite,
      mul.user_score,
      mul.chapters_read,
      mul.volumes_read,
      mul.notes,
      GROUP_CONCAT(g.name) as genre_names
    FROM manga m
    LEFT JOIN manga_user_list mul ON mul.manga_id = m.id
    LEFT JOIN manga_genres mg ON mg.manga_id = m.id
    LEFT JOIN genres g ON g.id = mg.genre_id
    WHERE m.id = ?
    GROUP BY m.id
  `, [id]);

  return row ? parseGenres(row) : null;
}

export async function getMangaSourceRows(queryClient: QueryClient): Promise<any[]> {
  return queryClient.all(`
    SELECT id, name, base_url, language, type, enabled, risk_level, rate_limit, last_sync
    FROM manga_sources
    ORDER BY enabled DESC, name COLLATE NOCASE ASC
  `);
}
