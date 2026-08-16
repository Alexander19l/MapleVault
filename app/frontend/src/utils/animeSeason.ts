export type AnimeSeasonId = 'winter' | 'spring' | 'summer' | 'fall';

export interface AnimeSeasonSnapshot {
  year: number;
  season: AnimeSeasonId;
  label: string;
}

const SEASON_LABELS: Record<AnimeSeasonId, string> = {
  winter: 'Invierno',
  spring: 'Primavera',
  summer: 'Verano',
  fall: 'Otoño'
};

export function getAnimeSeasonSnapshot(date = new Date()): AnimeSeasonSnapshot {
  const month = date.getMonth() + 1;
  const season: AnimeSeasonId = month <= 3
    ? 'winter'
    : month <= 6
      ? 'spring'
      : month <= 9
        ? 'summer'
        : 'fall';

  return {
    year: date.getFullYear(),
    season,
    label: SEASON_LABELS[season]
  };
}

export function getMillisecondsUntilNextLocalDay(date = new Date()): number {
  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    1
  );
  return Math.max(1000, nextDay.getTime() - date.getTime());
}
