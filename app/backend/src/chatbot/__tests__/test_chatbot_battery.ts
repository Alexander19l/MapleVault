import { handleChatMessage } from '../chatbot';
import { parseIntent } from '../nlpEngine';

const testCases = [
  { input: "hola asistente", expectedIntent: "GREETING" },
  { input: "busca jujutsu kaisen", expectedIntent: "SEARCH_ANIME", expectedEntity: "jujutsu kaisen" },
  { input: "borra naruto", expectedIntent: "REMOVE_FROM_LIBRARY", expectedEntity: "naruto" },
  { input: "cuántos episodios he visto hoy", expectedIntent: "LIBRARY_STATS" },
  { input: "recomiéndame algo de acción", expectedIntent: "RECOMMEND_GENERAL", expectedEntity: "acción" }, // Should be action maybe, but exact match is fine
  { input: "sincronizar biblioteca", expectedIntent: "SYNC_LIBRARY" },
  { input: "dime la sinopsis de bleach", expectedIntent: "EXPLAIN_SYNOPSIS", expectedEntity: "bleach" }
];

async function runBattery() {
  console.log('--- INICIANDO BATERÍA DE PRUEBAS DEL CHATBOT ---');
  let passed = 0;
  
  for (const tc of testCases) {
    console.log(`\nTest Input: "${tc.input}"`);
    try {
      const start = Date.now();
      const nlp = await parseIntent(tc.input);
      const latency = Date.now() - start;
      
      console.log(`  Intent Detectado: ${nlp.intent}`);
      if (nlp.entities && Object.keys(nlp.entities).length > 0) {
        console.log(`  Entidades:`, nlp.entities);
      }
      console.log(`  Latencia: ${latency}ms`);
      
      let testPassed = true;
      if (nlp.intent !== tc.expectedIntent) {
        console.log(`  FAILED: Expected intent ${tc.expectedIntent}, got ${nlp.intent}`);
        testPassed = false;
      }
      
      if (tc.expectedEntity && (!nlp.entities || !Object.values(nlp.entities).some(v => v === tc.expectedEntity || (typeof v === 'string' && v.includes(tc.expectedEntity))))) {
        console.log(`  FAILED: Expected entity ${tc.expectedEntity} not found in`, nlp.entities);
        testPassed = false;
      }
      
      if (testPassed) {
        console.log('  PASSED');
        passed++;
      }
    } catch (err: any) {
      console.log(`  ERROR FATAL: ${err.message}`);
    }
  }
  
  console.log(`\n--- RESULTADOS: ${passed}/${testCases.length} PASSED ---`);
  process.exit(passed === testCases.length ? 0 : 1);
}

runBattery();
