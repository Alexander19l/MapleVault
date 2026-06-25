import { query, initDb } from '../../src/database/db';
import { seedInitialMemory } from '../../src/chatbot/memory';

export async function seedTestData() {
  await initDb();

  // Limpiar tablas para un test limpio
  await query.run('DELETE FROM anime');
  await query.run('DELETE FROM genres');
  await query.run('DELETE FROM anime_genres');
  await query.run('DELETE FROM user_list');
  await query.run('DELETE FROM watched_episodes');
  await query.run('DELETE FROM assistant_memory');
  await query.run('DELETE FROM assistant_prompt_runs');

  // Sembrar memoria
  await seedInitialMemory();

  // Insertar Animes
  const animes = [
    { title: 'Naruto', type: 'serie', year: 2002, season: 'fall', status: 'FINISHED', episodes: 220 },
    { title: 'Death Note', type: 'serie', year: 2006, season: 'fall', status: 'FINISHED', episodes: 37 },
    { title: 'Jujutsu Kaisen', type: 'serie', year: 2020, season: 'fall', status: 'RELEASING', episodes: 24 },
    { title: 'Frieren', type: 'serie', year: 2023, season: 'fall', status: 'FINISHED', episodes: 28 },
    { title: 'Monster', type: 'serie', year: 2004, season: 'spring', status: 'FINISHED', episodes: 74 },
    { title: 'Your Name', type: 'película', year: 2016, season: 'summer', status: 'FINISHED', episodes: 1 }
  ];

  const animeIds: Record<string, number> = {};
  for (const a of animes) {
    const res = await query.run(`
      INSERT INTO anime (title, type, year, season, status, external_id, source, episodes) 
      VALUES (?, ?, ?, ?, ?, ?, 'anilist', ?)
    `, [a.title, a.type, a.year, a.season, a.status, Math.floor(Math.random()*1000), a.episodes]);
    animeIds[a.title] = res.lastID;
  }

  // Insertar Géneros
  const genres = ['acción', 'romance', 'misterio', 'psicológico', 'fantasía', 'drama'];
  const genreIds: Record<string, number> = {};
  for (const g of genres) {
    const res = await query.run('INSERT INTO genres (name) VALUES (?)', [g]);
    genreIds[g] = res.lastID;
  }

  // Relacionar Animes con Géneros
  const animeGenreMap: Record<string, string[]> = {
    'Naruto': ['acción', 'fantasía'],
    'Death Note': ['misterio', 'psicológico', 'drama'],
    'Jujutsu Kaisen': ['acción', 'fantasía'],
    'Frieren': ['fantasía', 'drama'],
    'Monster': ['misterio', 'psicológico', 'drama'],
    'Your Name': ['romance', 'drama', 'fantasía']
  };

  for (const [title, titleGenres] of Object.entries(animeGenreMap)) {
    for (const g of titleGenres) {
      await query.run('INSERT INTO anime_genres (anime_id, genre_id) VALUES (?, ?)', [animeIds[title], genreIds[g]]);
    }
  }

  // Lista de usuario
  const userListMap: Record<string, string> = {
    'Naruto': 'plan_to_watch',
    'Death Note': 'completed',
    'Jujutsu Kaisen': 'watching',
    'Frieren': 'watching',
    'Monster': 'plan_to_watch',
    'Your Name': 'completed'
  };

  for (const [title, status] of Object.entries(userListMap)) {
    await query.run('INSERT INTO user_list (anime_id, watch_status) VALUES (?, ?)', [animeIds[title], status]);
  }

  // Capítulos Vistos
  // JJK ep 1 y 2
  await query.run('INSERT INTO watched_episodes (episode_number, anime_id) VALUES (?, ?)', [1, animeIds['Jujutsu Kaisen']]);
  await query.run('INSERT INTO watched_episodes (episode_number, anime_id) VALUES (?, ?)', [2, animeIds['Jujutsu Kaisen']]);
  // Frieren ep 1
  await query.run('INSERT INTO watched_episodes (episode_number, anime_id) VALUES (?, ?)', [1, animeIds['Frieren']]);

}
