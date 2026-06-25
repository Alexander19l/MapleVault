import { parseIntent } from './src/chatbot/nlpEngine';
import { initDb } from './src/database/db';
import { setAISettings } from './src/chatbot/aiSettings';

async function test() {
  await initDb();
  await setAISettings({ provider: 'ollama', model: 'llama3.2', url: 'http://localhost:11434', enabled: true, temperature: 0.2, maxTokens: 500, contextLimit: 2048 });
  
  console.log("Prueba 1: busca jjk");
  const res1 = await parseIntent('busca jjk');
  console.log(res1);

  console.log("\nPrueba 2: jjk");
  const res2 = await parseIntent('jjk');
  console.log(res2);

  console.log("\nPrueba 3: animes de romance de 2023");
  const res3 = await parseIntent('animes de romance de 2023');
  console.log(res3);
}

test().catch(console.error);
