import { query } from '../database/db';

export interface RecommendedAnime {
  id: number;
  title: string;
  cover_image: string;
  studio: string;
  score: number;
  genres: string[];
  matchScore: number;
  reason: string;
}

export async function getLocalRecommendations(): Promise<RecommendedAnime[]> {
  try {
    // 1. Obtener la lista personal del usuario (calificados >= 7 o favoritos)
    const userLikes = await query.all(`
      SELECT ul.anime_id, ul.user_score, ul.favorite, a.studio
      FROM user_list ul
      JOIN anime a ON ul.anime_id = a.id
      WHERE ul.user_score >= 7 OR ul.favorite = 1
    `);

    if (userLikes.length === 0) {
      // Si el usuario no tiene historial, recomendar los mejor puntuados y populares del catálogo local
      const topAnime = await query.all(`
        SELECT a.id, a.title, a.cover_image, a.studio, a.score,
               GROUP_CONCAT(DISTINCT g.name) as genres_joined
        FROM anime a
        LEFT JOIN user_list ul ON a.id = ul.anime_id
        LEFT JOIN anime_genres ag ON a.id = ag.anime_id
        LEFT JOIN genres g ON ag.genre_id = g.id
        WHERE ul.id IS NULL
          AND a.is_adult = 0 
          AND a.id NOT IN (SELECT anime_id FROM anime_genres ag2 JOIN genres g2 ON ag2.genre_id = g2.id WHERE g2.name = 'Hentai')
        GROUP BY a.id
        ORDER BY a.score DESC, a.popularity DESC
        LIMIT 5
      `);

      return topAnime.map(anime => ({
        id: anime.id,
        title: anime.title,
        cover_image: anime.cover_image,
        studio: anime.studio,
        score: anime.score,
        genres: splitJoinedGenres(anime.genres_joined),
        matchScore: 0,
        reason: 'Basado en las series mejor valoradas del catálogo.'
      }));
    }

    // 2. Construir perfil de géneros favoritos
    const genreCounts: { [key: string]: number } = {};
    const likedGenreRows = await query.all(`
      SELECT ul.anime_id, g.name
      FROM user_list ul
      JOIN anime_genres ag ON ul.anime_id = ag.anime_id
      JOIN genres g ON ag.genre_id = g.id
      WHERE ul.user_score >= 7 OR ul.favorite = 1
    `);
    const genresByLikedAnime = new Map<number, string[]>();
    for (const row of likedGenreRows) {
      const animeId = Number(row.anime_id);
      if (!genresByLikedAnime.has(animeId)) genresByLikedAnime.set(animeId, []);
      genresByLikedAnime.get(animeId)?.push(String(row.name));
    }

    for (const like of userLikes) {
      const animeGenres = genresByLikedAnime.get(Number(like.anime_id)) || [];
      const weight = (like.favorite ? 2 : 1) + (like.user_score ? (like.user_score - 6) / 2 : 0);
      
      for (const g of animeGenres) {
        genreCounts[g] = (genreCounts[g] || 0) + weight;
      }
    }

    // 3. Construir perfil de estudios favoritos
    const studioCounts: { [key: string]: number } = {};
    for (const like of userLikes) {
      if (like.studio) {
        const weight = (like.favorite ? 2 : 1) + (like.user_score ? (like.user_score - 6) / 2 : 0);
        studioCounts[like.studio] = (studioCounts[like.studio] || 0) + weight;
      }
    }

    // 4. Obtener candidatos con géneros agregados en una sola consulta.
    const candidates = await query.all(`
      SELECT a.id, a.title, a.cover_image, a.studio, a.score, a.popularity,
             GROUP_CONCAT(DISTINCT g.name) as genres_joined
      FROM anime a
      LEFT JOIN user_list ul ON a.id = ul.anime_id
      LEFT JOIN anime_genres ag ON a.id = ag.anime_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      WHERE ul.id IS NULL
        AND a.is_adult = 0 
        AND a.id NOT IN (SELECT anime_id FROM anime_genres ag2 JOIN genres g2 ON ag2.genre_id = g2.id WHERE g2.name = 'Hentai')
      GROUP BY a.id
      ORDER BY a.score DESC, a.popularity DESC, a.id DESC
      LIMIT 2000
    `);

    // 5. Evaluar cada candidato
    const results: RecommendedAnime[] = [];
    for (const cand of candidates) {
      const candGenres = splitJoinedGenres(cand.genres_joined);
      
      let matchScore = 0;
      const matchedGenres: string[] = [];

      // Sumar peso por géneros coincidentes
      for (const g of candGenres) {
        if (genreCounts[g]) {
          matchScore += genreCounts[g] * 2;
          matchedGenres.push(g);
        }
      }

      // Sumar peso por estudio coincidente
      let matchedStudio = false;
      if (cand.studio && studioCounts[cand.studio]) {
        matchScore += studioCounts[cand.studio] * 3;
        matchedStudio = true;
      }

      // Añadir peso por calidad del anime
      if (cand.score) {
        matchScore += cand.score;
      }

      // Generar explicación inteligente
      let reason = 'Recomendado para ti.';
      if (matchedGenres.length > 0 && matchedStudio) {
        reason = `Porque te gustan los géneros ${matchedGenres.slice(0, 2).join(' y ')} y el estudio ${cand.studio}.`;
      } else if (matchedGenres.length > 0) {
        reason = `Por tu interés en los géneros ${matchedGenres.slice(0, 2).join(' y ')}.`;
      } else if (matchedStudio) {
        reason = `Por tus calificaciones positivas a series del estudio ${cand.studio}.`;
      } else if (cand.score && cand.score >= 8.5) {
        reason = `Una de las series mejor calificadas del catálogo local (${cand.score}).`;
      }

      results.push({
        id: cand.id,
        title: cand.title,
        cover_image: cand.cover_image,
        studio: cand.studio,
        score: cand.score,
        genres: candGenres,
        matchScore,
        reason
      });
    }

    // Ordenar de mayor coincidencia a menor
    results.sort((a, b) => b.matchScore - a.matchScore);

    // Retornar las mejores 5 recomendaciones
    return results.slice(0, 5);
  } catch (err) {
    console.error('Error al generar recomendaciones:', err);
    return [];
  }
}

function splitJoinedGenres(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map(genre => genre.trim())
    .filter(Boolean);
}
