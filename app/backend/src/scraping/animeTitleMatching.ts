export interface AnimeTitleCandidate {
  slug: string;
  title: string;
}

export interface AnimeTitleMatch {
  candidate: AnimeTitleCandidate;
  score: number;
  matchedAlias: string;
}

const LOW_SIGNAL_TOKENS = new Set(['a', 'an', 'no', 'of', 'the']);

function canonicalizeSeason(value: string): string {
  const ordinalWords: Record<string, string> = {
    first: '1',
    second: '2',
    third: '3',
    fourth: '4',
    fifth: '5',
    sixth: '6',
    seventh: '7',
    eighth: '8',
    ninth: '9',
    tenth: '10'
  };

  let result = value;
  const trailingNumber = result.match(/^(.*\S)\s+(\d{1,2})\s*$/);
  if (trailingNumber) {
    const seasonNumber = Number(trailingNumber[2]);
    const prefix = trailingNumber[1].trim();
    const isFormatNumber = /\b(?:season|temporada|movie|film|part|ova|ona|special)\s*$/i.test(prefix);
    if (seasonNumber >= 2 && seasonNumber <= 20 && !isFormatNumber) {
      result = `${prefix} season ${seasonNumber}`;
    }
  }

  result = result.replace(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/g,
    (_, ordinal: string) => `season ${ordinalWords[ordinal]}`
  );
  result = result.replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g, 'season $1');
  result = result.replace(/\btemporada\s+(\d+)\b/g, 'season $1');
  return result.replace(/\bseason\s+(\d+)\b/g, 'season-$1');
}

export function normalizeAnimeTitle(value: string): string {
  return canonicalizeSeason(String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase())
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getComparisonTokens(value: string): Set<string> {
  return new Set(
    normalizeAnimeTitle(value)
      .split(' ')
      .filter(token => token.length > 0 && !LOW_SIGNAL_TOKENS.has(token))
  );
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function getSeasonNumber(normalizedTitle: string): number {
  const match = normalizedTitle.match(/\bseason\s+(\d{1,2})\b/);
  const season = Number(match?.[1]);
  return Number.isInteger(season) && season > 0 ? season : 1;
}

export function scoreAnimeTitleMatch(alias: string, candidateTitle: string): number {
  const normalizedAlias = normalizeAnimeTitle(alias);
  const normalizedCandidate = normalizeAnimeTitle(candidateTitle);
  if (!normalizedAlias || !normalizedCandidate) return 0;
  if (getSeasonNumber(normalizedAlias) !== getSeasonNumber(normalizedCandidate)) return 0;
  if (normalizedAlias === normalizedCandidate) return 1;

  const aliasTokens = getComparisonTokens(alias);
  const candidateTokens = getComparisonTokens(candidateTitle);
  if (aliasTokens.size === 0 || candidateTokens.size === 0) return 0;

  const shared = intersectionSize(aliasTokens, candidateTokens);
  const candidateCoverage = shared / candidateTokens.size;
  const aliasCoverage = shared / aliasTokens.size;
  const dice = (2 * shared) / (aliasTokens.size + candidateTokens.size);

  // La coincidencia aproximada solo se acepta cuando el título de AV1 está
  // contenido casi por completo en un alias local. Esto evita confundir
  // secuelas y spin-offs que comparten el nombre de la franquicia.
  if (candidateCoverage < 0.95 || aliasCoverage < 0.62 || dice < 0.78) return 0;
  return Math.min(0.99, dice);
}

export function findBestAnimeTitleMatch(
  aliases: Array<string | null | undefined>,
  candidates: AnimeTitleCandidate[]
): AnimeTitleMatch | null {
  let best: AnimeTitleMatch | null = null;
  const aliasSeasons = new Set(
    aliases
      .filter((alias): alias is string => Boolean(alias?.trim()))
      .map(alias => getSeasonNumber(normalizeAnimeTitle(alias)))
      .filter(season => season > 1)
  );
  const expectedSeason = aliasSeasons.size === 1
    ? [...aliasSeasons][0]
    : null;

  for (const candidate of candidates) {
    if (!candidate.slug || !candidate.title) continue;
    if (
      expectedSeason !== null
      && getSeasonNumber(normalizeAnimeTitle(candidate.title)) !== expectedSeason
    ) {
      continue;
    }

    for (const alias of aliases) {
      if (!alias?.trim()) continue;
      const score = scoreAnimeTitleMatch(alias, candidate.title);
      if (score > 0 && (!best || score > best.score)) {
        best = { candidate, score, matchedAlias: alias };
      }
    }
  }

  return best;
}

export function isAnimeTitleMatch(
  aliases: Array<string | null | undefined>,
  candidateTitle: string
): boolean {
  return Boolean(findBestAnimeTitleMatch(aliases, [{
    slug: 'validation-only',
    title: candidateTitle
  }]));
}
