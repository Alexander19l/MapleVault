import { describe, expect, it } from 'vitest';
import { buildAnimeSearchPlan } from '../searchQueryPlanner';

describe('chatbot/searchQueryPlanner', () => {
  it('builds an empty plan for vague search requests', () => {
    const plan = buildAnimeSearchPlan({});

    expect(plan.hasSearchCriteria).toBe(false);
    expect(plan.sql).toBe('');
    expect(plan.params).toEqual([]);
  });

  it('builds a local search query with title, season and year filters', () => {
    const plan = buildAnimeSearchPlan({
      query: 'naruto',
      season: 'fall',
      year: 2002
    });

    expect(plan.hasSearchCriteria).toBe(true);
    expect(plan.queryText).toBe('naruto');
    expect(plan.sql).toContain('LOWER(a.title) LIKE ?');
    expect(plan.sql).toContain('a.season = ?');
    expect(plan.sql).toContain('a.year = ?');
    expect(plan.params).toEqual(['%naruto%', '%naruto%', '%naruto%', 2002, 'fall']);
  });

  it('builds grouped genre filters for compound genre requests', () => {
    const plan = buildAnimeSearchPlan({
      genre: 'comedy, romance'
    });

    expect(plan.sql).toContain('LOWER(g.name) IN (?, ?)');
    expect(plan.sql).toContain('GROUP BY a.id HAVING COUNT(DISTINCT LOWER(g.name)) >= ?');
    expect(plan.params).toEqual(['comedy', 'romance', 2]);
  });

  it('builds advanced filters for studio, format, score and year range', () => {
    const plan = buildAnimeSearchPlan({
      studio: 'mappa',
      format: 'tv',
      min_score: 8,
      max_score: 9,
      year_from: 2024,
      year_to: 2026
    });

    expect(plan.sql).toContain('LOWER(a.studio) LIKE ?');
    expect(plan.sql).toContain('LOWER(a.type) = ?');
    expect(plan.sql).toContain('a.score >=');
    expect(plan.sql).toContain('a.score <=');
    expect(plan.sql).toContain('a.year >=');
    expect(plan.sql).toContain('a.year <=');
    expect(plan.params).toEqual(['%mappa%', 'tv', 2024, 2026, 8, 9]);
  });

  it('builds duration filters for short finished TV searches', () => {
    const plan = buildAnimeSearchPlan({
      format: 'tv',
      max_episodes: 13
    });

    expect(plan.hasSearchCriteria).toBe(true);
    expect(plan.sql).toContain('LOWER(a.type) = ?');
    expect(plan.sql).toContain('a.episodes IS NOT NULL');
    expect(plan.sql).toContain('LOWER(a.status) IN');
    expect(plan.params).toEqual(['tv', 13]);
  });

  it('builds text-backed tag filters and exclusions', () => {
    const plan = buildAnimeSearchPlan({
      tags: ['cyberpunk', 'technology', 'hacking'],
      exclude_tags: ['kids', 'family']
    });

    expect(plan.hasSearchCriteria).toBe(true);
    expect(plan.onlineQueryText).toBe('cyberpunk technology hacking');
    expect(plan.sql).toContain('LOWER(COALESCE(a.synopsis');
    expect(plan.sql).toContain('NOT LIKE');
    expect(plan.params).toContain('%cyberpunk%');
    expect(plan.params).toContain('%kids%');
  });
});
