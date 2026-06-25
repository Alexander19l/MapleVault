import { handleChatMessage } from './chatbot';

async function test() {
  console.log('Testing chat message...');
  const res = await handleChatMessage('Recomiéndame un buen anime de acción');
  console.log('Response:', res.text);
}

test().catch(console.error);
