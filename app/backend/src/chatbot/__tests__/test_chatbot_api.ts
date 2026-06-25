import axios from 'axios';

async function testApi() {
  console.log("=== INICIANDO PRUEBAS E2E DE LA API DEL CHATBOT ===");
  const testCases = [
    { text: "busca jjk" },
    { text: "recomiendame algo de accion" },
    { text: "ver estadisticas" }
  ];

  for (const tc of testCases) {
    console.log(`\nEnviando: "${tc.text}" a http://localhost:5000/api/chatbot/message...`);
    try {
      const res = await axios.post('http://localhost:5000/api/chatbot/message', {
        message: tc.text
      });
      console.log('Status:', res.status);
      console.log('Respuesta de texto:', res.data.text);
      if (res.data.visualData) {
        console.log('Visual Data Type:', res.data.visualData.type);
        console.log(`Visual Data Count: ${res.data.visualData.data?.length || 0}`);
      }
      if (res.data.action) {
        console.log('Action:', res.data.action.type);
      }
    } catch (err: any) {
      console.error('Error:', err.response?.data || err.message);
    }
  }
}

testApi().catch(console.error);
