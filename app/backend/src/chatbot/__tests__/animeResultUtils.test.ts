import { describe, expect, it } from 'vitest';
import {
  decorateResult,
  fieldOrUnavailable,
  formatEpisodeCount,
  inferSeasonNumberFromTitle,
  mergeAnimeResults,
  normalizeTitleKey,
  uniqueToneTags
} from '../animeResultUtils';

describe('chatbot/animeResultUtils', () => {
  it('normalizes title keys for deduplication', () => {
    expect(normalizeTitleKey('Fullmetal Alchemist: Brotherhood')).toBe('fullmetal alchemist brotherhood');
  });

  it('decorates and deduplicates local and online results', () => {
    const local = decorateResult({ title: 'Baki', year: 2018 }, 'local');
    const online = decorateResult({ title_romaji: 'Baki', title: 'Baki', year: 2018 }, 'online');
    const other = decorateResult({ title: 'Baki Hanma', year: 2021 }, 'online');

    const merged = mergeAnimeResults([local], [online, other]);

    expect(local.result_origin).toBe('local');
    expect(merged).toHaveLength(2);
    expect(merged.map(item => item.title)).toEqual(['Baki', 'Baki Hanma']);
  });

  it('formats unavailable fields and online episode counts consistently', () => {
    expect(fieldOrUnavailable(null)).toBe('dato no disponible');
    expect(fieldOrUnavailable(['Action', 'Drama'])).toBe('Action, Drama');
    expect(formatEpisodeCount({ result_origin: 'online' })).toBe('se cargan al abrir la ficha o al importar la serie');
    expect(formatEpisodeCount({ episodes: 12 })).toBe('12');
  });

  it('infers season numbers from common title formats', () => {
    expect(inferSeasonNumberFromTitle('Code Geass Season 2')).toBe(2);
    expect(inferSeasonNumberFromTitle('Some Anime S3')).toBe(3);
    expect(inferSeasonNumberFromTitle('Standalone Movie')).toBeNull();
  });

  it('normalizes tone tags without duplicates', () => {
    expect(uniqueToneTags(['oscuro', 'dark', 'romance'])).toEqual(['dark', 'romance_focus']);
  });
});
