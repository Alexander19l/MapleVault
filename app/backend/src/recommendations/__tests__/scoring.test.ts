import { describe, expect, it } from 'vitest';
import {
  buildRecommendationPreferenceProfile,
  rankAnimeCandidates,
  splitGenres
} from '../scoring';

describe('recommendations/scoring', () => {
  it('normaliza generos y combina solicitud, memoria explicita y perfil inferido', () => {
    const profile = buildRecommendationPreferenceProfile({
      requestedGenre: 'Mystery, Drama',
      favoriteGenres: ['Action', 'Drama'],
      soulProfile: {
        dislikedGenres: ['Horror'],
        inferredGenres: [
          { genre: 'Psychological', weight: 90 },
          { genre: 'Action', weight: 70 }
        ]
      }
    });

    expect(profile.requestedGenres).toEqual(['mystery', 'drama']);
    expect(profile.explicitFavoriteGenres).toEqual(['action', 'drama']);
    expect(profile.inferredGenres).toEqual(['psychological', 'action']);
    expect(profile.dislikedGenres).toEqual(['horror']);
    expect(profile.preferenceGenres).toEqual(['mystery', 'drama', 'action', 'psychological']);
  });

  it('rankea primero candidatos con coincidencia de genero y senales locales', () => {
    const ranked = rankAnimeCandidates([
      { title: 'Popular Comedy', genres_joined: 'Comedy', score: 8.5, popularity: 100000 },
      { title: 'Preferred Mystery', genres_joined: 'Mystery,Drama', score: 7.1, popularity: 1000, watch_status: 'plan_to_watch' },
      { title: 'Weak Candidate', genres_joined: 'Sports', score: 5.5, popularity: 2000 }
    ], {
      preferenceGenres: ['mystery', 'drama'],
      limit: 3
    });

    expect(ranked[0].title).toBe('Preferred Mystery');
    expect(ranked[0].recommendation_factors.genreMatches).toBe(2);
    expect(ranked[0].recommendation_reason).toContain('coincide');
  });

  it('penaliza generos rechazados y series abandonadas', () => {
    const ranked = rankAnimeCandidates([
      { title: 'Rejected Horror', genres_joined: 'Horror,Drama', score: 9.5, popularity: 90000, watch_status: 'dropped' },
      { title: 'Neutral Drama', genres_joined: 'Drama', score: 7.2, popularity: 1000 }
    ], {
      preferenceGenres: ['drama'],
      dislikedGenres: ['horror'],
      limit: 2
    });

    expect(ranked[0].title).toBe('Neutral Drama');
    expect(ranked[1].recommendation_factors.dislikedMatches).toBe(1);
  });

  it('penaliza series rechazadas por feedback explicito', () => {
    const ranked = rankAnimeCandidates([
      { id: 1, title: 'Rejected Anime', genres_joined: 'Drama', score: 10, popularity: 100000 },
      { id: 2, title: 'Accepted Anime', genres_joined: 'Drama', score: 6.5, popularity: 1000 }
    ], {
      preferenceGenres: ['drama'],
      dislikedAnime: [{ id: 1, title: 'Rejected Anime', titleKey: 'rejected anime' }],
      limit: 2
    });

    expect(ranked[0].title).toBe('Accepted Anime');
    expect(ranked[1].recommendation_factors.dislikedAnimeMatch).toBe(1);
  });

  it('prioriza tonos preferidos y penaliza tonos rechazados', () => {
    const ranked = rankAnimeCandidates([
      { title: 'Romance Comedy', genres_joined: 'Romance,Comedy', score: 9.9, synopsis: 'A romantic school comedy.' },
      { title: 'Dark Mystery', genres_joined: 'Mystery,Drama', score: 7.0, synopsis: 'A dark psychological mystery.' }
    ], {
      preferredToneTags: ['dark'],
      dislikedToneTags: ['romance_focus'],
      limit: 2
    });

    expect(ranked[0].title).toBe('Dark Mystery');
    expect(ranked[0].recommendation_factors.toneMatches).toBeGreaterThan(0);
    expect(ranked[1].recommendation_factors.dislikedToneMatches).toBeGreaterThan(0);
    expect(ranked[0].recommendation_reason).toContain('tono oscuro');
  });

  it('prioriza estudio, formato y duracion preferida', () => {
    const ranked = rankAnimeCandidates([
      { title: 'Generic Long TV', genres_joined: 'Drama', studio: 'Other', type: 'tv', episodes: 50, score: 8.2 },
      { title: 'Preferred Short Movie', genres_joined: 'Drama', studio: 'Madhouse', type: 'movie', episodes: 1, score: 7.1 }
    ], {
      preferenceGenres: ['drama'],
      preferredStudios: ['madhouse'],
      preferredFormats: ['movie'],
      preferredEpisodeLength: 'short',
      limit: 2
    });

    expect(ranked[0].title).toBe('Preferred Short Movie');
    expect(ranked[0].recommendation_factors.studioMatch).toBe(1);
    expect(ranked[0].recommendation_factors.formatMatch).toBe(1);
    expect(ranked[0].recommendation_factors.durationMatch).toBe(1);
    expect(ranked[0].recommendation_reason).toContain('estudio preferido');
  });

  it('penaliza estudio, formato y duracion rechazados', () => {
    const ranked = rankAnimeCandidates([
      { title: 'Rejected Long OVA', genres_joined: 'Drama', studio: 'Trigger', type: 'ova', episodes: 30, score: 9.9, popularity: 100000 },
      { title: 'Accepted Drama', genres_joined: 'Drama', studio: 'Madhouse', type: 'tv', episodes: 12, score: 7.0 }
    ], {
      preferenceGenres: ['drama'],
      dislikedStudios: ['trigger'],
      dislikedFormats: ['ova'],
      dislikedEpisodeLengths: ['long'],
      limit: 2
    });

    expect(ranked[0].title).toBe('Accepted Drama');
    expect(ranked[1].recommendation_factors.dislikedStudioMatch).toBe(1);
    expect(ranked[1].recommendation_factors.dislikedFormatMatch).toBe(1);
    expect(ranked[1].recommendation_factors.dislikedDurationMatch).toBe(1);
  });

  it('divide listas de generos sin duplicados ni valores vacios', () => {
    expect(splitGenres('Action, action, , Drama')).toEqual(['action', 'drama']);
    expect(splitGenres(['Fantasy', 'fantasy', ''])).toEqual(['fantasy']);
  });
});
