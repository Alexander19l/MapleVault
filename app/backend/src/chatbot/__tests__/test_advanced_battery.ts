import { parseIntent } from '../nlpEngine';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const testCases = [
  { input: "busca naruto", expectedIntent: "SEARCH_ANIME" },
  { input: "busca una serie de terror", expectedIntent: "SEARCH_ANIME", expectedEntities: { genre: "horror" } },
  { input: "recomiendame algo de fantasia", expectedIntent: "RECOMMEND_GENERAL", expectedEntities: { genre: "fantasy" } },
  { input: "recomiendame algo similar a lo que me gusta", expectedIntent: "RECOMMEND_GENERAL" },
  { input: "cuantos animes de comedia tengo", expectedIntent: "LIBRARY_STATS" }, // O SEARCH_ANIME con filtros dependiendo, asume LIBRARY_STATS
  { input: "agrega jjk a mi lista", expectedIntent: "ADD_TO_LIBRARY", expectedEntities: { animeTitle: "jjk" } }
];

async function runTests() {
  console.log("--- INICIANDO BATERÍA DE PRUEBAS AVANZADAS ---");
  const settings = null;
  let passed = 0;

  for (const tc of testCases) {
    console.log(`\nTest Input: "${tc.input}"`);
    const start = Date.now();
    try {
      const result = await parseIntent(tc.input);
      const latencia = Date.now() - start;
      console.log(`  Intent Detectado: ${result.intent}`);
      if (Object.keys(result.entities).length > 0) {
        console.log(`  Entidades:`, result.entities);
      }
      console.log(`  Latencia: ${latencia}ms`);

      let pass = result.intent === tc.expectedIntent;
      if (tc.expectedEntities) {
        for (const [k, v] of Object.entries(tc.expectedEntities)) {
          if ((result.entities as any)[k] !== v) {
            pass = false;
            console.log(`  FAILED: Esperaba entidad ${k}=${v}, obtuvo ${result.entities[k as keyof typeof result.entities]}`);
          }
        }
      }

      if (pass) {
        console.log("  PASSED");
        passed++;
      } else {
        if (result.intent !== tc.expectedIntent) {
           console.log(`  FAILED: Esperaba intent ${tc.expectedIntent}, obtuvo ${result.intent}`);
        }
      }
    } catch (err: any) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  console.log(`\n--- RESULTADOS: ${passed}/${testCases.length} PASSED ---`);
}

runTests().catch(console.error);
