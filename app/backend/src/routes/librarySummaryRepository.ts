import { buildNonAdultCondition } from './libraryFilters';

export interface LibrarySummaryQueryClient {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
}

export interface DashboardSummaryData {
  stats: {
    total: number;
    watching: number;
    pending: number;
    completed: number;
    favorites: number;
  };
  recentRows: any[];
  airingRows: any[];
}

export interface SeasonsSummaryData {
  years: number[];
  countsBySeason: Record<string, number>;
  comparisons: {
    bestCountSeason: string;
    bestScoreSeason: string;
    topGenres: string[];
    topStudio: string;
    studioCount: number;
  };
}

export async function getDashboardSummaryData(
  queryClient: LibrarySummaryQueryClient
): Promise<DashboardSummaryData> {
  const nonAdultCondition = buildNonAdultCondition();
  const [totalRow, userListStats, favoriteRow, recentRows, airingRows] = await Promise.all([
    queryClient.get(`SELECT COUNT(*) as count FROM anime a WHERE ${nonAdultCondition}`),
    queryClient.all(`
      SELECT watch_status, COUNT(*) as count
      FROM user_list
      GROUP BY watch_status
    `),
    queryClient.get('SELECT COUNT(*) as count FROM user_list WHERE favorite = 1'),
    queryClient.all(`
      SELECT a.id, a.title, a.title_romaji, a.title_english, a.title_japanese,
             a.year, a.season, a.status, a.type, a.episodes, a.score, a.popularity,
             a.cover_image, a.studio, a.is_adult,
             ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched,
             GROUP_CONCAT(DISTINCT g.name) as genres_joined
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      LEFT JOIN anime_genres ag ON a.id = ag.anime_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      WHERE ${nonAdultCondition}
      GROUP BY a.id
      ORDER BY a.id DESC
      LIMIT 4
    `),
    queryClient.all(`
      SELECT a.id, a.title, a.title_romaji, a.title_english, a.title_japanese,
             a.year, a.season, a.status, a.type, a.episodes, a.score, a.popularity,
             a.cover_image, a.studio, a.is_adult,
             ul.watch_status, ul.favorite, ul.user_score, ul.episodes_watched,
             GROUP_CONCAT(DISTINCT g.name) as genres_joined
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      LEFT JOIN anime_genres ag ON a.id = ag.anime_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      WHERE ${nonAdultCondition}
        AND a.status = 'airing'
      GROUP BY a.id
      ORDER BY a.popularity DESC, a.score DESC, a.id DESC
      LIMIT 6
    `)
  ]);

  const byStatus = userListStats.reduce((acc: Record<string, number>, row: any) => {
    acc[row.watch_status] = Number(row.count) || 0;
    return acc;
  }, {});

  return {
    stats: {
      total: Number(totalRow?.count) || 0,
      watching: byStatus.watching || 0,
      pending: byStatus.plan_to_watch || 0,
      completed: byStatus.completed || 0,
      favorites: Number(favoriteRow?.count) || 0
    },
    recentRows,
    airingRows
  };
}

export async function getSeasonsSummaryData(
  queryClient: LibrarySummaryQueryClient
): Promise<SeasonsSummaryData> {
  const nonAdultCondition = buildNonAdultCondition();
  const [yearRows, seasonRows, genreRows, studioRow] = await Promise.all([
    queryClient.all(`
      SELECT DISTINCT a.year
      FROM anime a
      WHERE ${nonAdultCondition}
        AND a.year IS NOT NULL
      ORDER BY a.year DESC
    `),
    queryClient.all(`
      SELECT a.year, a.season, COUNT(*) as count,
             AVG(CASE WHEN a.score > 0 THEN a.score END) as avg_score
      FROM anime a
      WHERE ${nonAdultCondition}
        AND a.year IS NOT NULL
        AND a.season IS NOT NULL
        AND a.season != ''
      GROUP BY a.year, a.season
      ORDER BY a.year DESC
    `),
    queryClient.all(`
      SELECT g.name, COUNT(*) as count
      FROM anime a
      JOIN anime_genres ag ON a.id = ag.anime_id
      JOIN genres g ON ag.genre_id = g.id
      WHERE ${nonAdultCondition}
      GROUP BY g.id, g.name
      ORDER BY count DESC, g.name ASC
      LIMIT 3
    `),
    queryClient.get(`
      SELECT a.studio, COUNT(*) as count
      FROM anime a
      WHERE ${nonAdultCondition}
        AND a.studio IS NOT NULL
        AND TRIM(a.studio) != ''
      GROUP BY a.studio
      ORDER BY count DESC, a.studio ASC
      LIMIT 1
    `)
  ]);

  const countsBySeason: Record<string, number> = {};
  let bestCountSeason = 'S/D';
  let bestCount = 0;
  let bestScoreSeason = 'S/D';
  let bestScore = 0;

  for (const row of seasonRows) {
    const year = Number(row.year);
    const season = String(row.season || '').toLowerCase();
    if (!year || !season) continue;

    const key = `${year}:${season}`;
    const count = Number(row.count) || 0;
    const avgScore = Number(row.avg_score) || 0;
    countsBySeason[key] = count;

    const label = `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
    if (count > bestCount) {
      bestCount = count;
      bestCountSeason = `${label} (${count} series)`;
    }
    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestScoreSeason = `${label} (Nota: ${avgScore.toFixed(1)})`;
    }
  }

  return {
    years: yearRows.map((row: any) => Number(row.year)).filter(Boolean),
    countsBySeason,
    comparisons: {
      bestCountSeason,
      bestScoreSeason,
      topGenres: genreRows.map((row: any) => row.name).filter(Boolean),
      topStudio: studioRow?.studio || 'S/D',
      studioCount: Number(studioRow?.count) || 0
    }
  };
}
