import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testElevenLabs() {
  const API_KEY = process.env.ELEVENLABS_API_KEY!;
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID_Carla!;

  console.log('🧪 Testando ElevenLabs API...\n');
  console.log(`🔑 API Key: ${API_KEY.substring(0, 10)}...`);
  console.log(`🎤 Voice ID: ${VOICE_ID}\n`);

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text: 'Olá, este é um teste.',
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    console.log('✅ API ElevenLabs está funcionando!');
    console.log(`📊 Status: ${response.status}`);
    console.log(`📦 Tamanho do áudio: ${response.data.byteLength} bytes`);
  } catch (error: any) {
    console.error('❌ Erro ao testar API ElevenLabs:');
    console.error(`Status: ${error.response?.status || 'N/A'}`);
    console.error(`Message: ${error.message}`);
    console.error(`URL: ${error.config?.url}`);

    if (error.response?.data) {
      console.error('Response data:', error.response.data.toString());
    }
  }
}

testElevenLabs();
