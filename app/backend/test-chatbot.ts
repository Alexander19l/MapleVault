import { initDb } from './src/database/db';
import { handleChatMessage } from './src/chatbot/chatbot';

async function runTests() {
  console.log("Inicializando base de datos...");
  await initDb();
  
  console.log("\n=== PRUEBA 1: Buscar anime ===");
  const res1 = await handleChatMessage('Busca animes de romance');
  console.log("Respuesta:", res1.text);
  console.log("Acción visual:", res1.action?.type);

  console.log("\n=== PRUEBA 2: Actualizar biblioteca ===");
  const res2 = await handleChatMessage('Sincroniza mi biblioteca');
  console.log("Respuesta:", res2.text);
  console.log("Acción visual:", res2.action?.type);
  
  console.log("\n=== PRUEBA 3: Memoria ===");
  const res3 = await handleChatMessage('Recuerda que me gusta el género mecha');
  console.log("Respuesta:", res3.text);
  
  console.log("\n=== PRUEBA 4: Fallback Conversacional ===");
  const res4 = await handleChatMessage('Hola, ¿quién eres?');
  console.log("Respuesta:", res4.text);
}

runTests().catch(console.error);
