import { describe, expect, it } from 'vitest';
import {
  getMapleVaultPlayerCapabilities,
  getRecommendedAnimeSourceIntegrations
} from '../../src/sources/mediaSourceCandidates';

describe('selección de integraciones de anime', () => {
  it('limita la shortlist a cinco fuentes nuevas y dos en inglés', () => {
    const sources = getRecommendedAnimeSourceIntegrations();

    expect(sources).toHaveLength(5);
    expect(new Set(sources.map(source => source.id)).size).toBe(5);
    expect(sources.filter(source => source.languages.includes('en'))).toHaveLength(2);
    expect(sources.every(source => source.enabledByDefault === false)).toBe(true);
  });

  it('no presenta torrents como compatibles con el reproductor actual', () => {
    const sources = getRecommendedAnimeSourceIntegrations();
    const torrentSources = sources.filter(source => source.transports.includes('torrent'));

    expect(getMapleVaultPlayerCapabilities().torrent).toBe('unsupported');
    expect(torrentSources.length).toBeGreaterThan(0);
    expect(torrentSources.every(source => source.playerSupport !== 'supported')).toBe(true);
  });

  it('mantiene las fuentes comunitarias en modo de investigación', () => {
    const sources = getRecommendedAnimeSourceIntegrations();
    const communitySources = sources.filter(source => source.risk === 'high');

    expect(communitySources.length).toBeGreaterThan(0);
    expect(communitySources.every(source => source.integrationStatus === 'research-only')).toBe(true);
  });
});
