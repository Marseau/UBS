#!/usr/bin/env ts-node

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID_Bruno = process.env.ELEVENLABS_VOICE_ID_Bruno;
const DID_API_KEY = process.env.DID_API_KEY;
const DID_AVATAR_BRUNO_URL = process.env.DID_AVATAR_BRUNO_URL;

async function testWithAudioFile() {
  console.log('🎬 Teste: Avatar Bruno + Voz Clonada (via upload)\n');

  const script = 'Olá! Sou o Bruno, especialista do UBS Taylor Made. Nossa IA responde leads em apenas 3 segundos.';

  console.log('📝 Script:', script);
  console.log('\n🎤 Etapa 1: Gerando áudio com voz clonada ElevenLabs...');

  try {
    // 1. Generate audio with ElevenLabs
    const audioResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID_Bruno}`,
      {
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    console.log('✅ Áudio gerado!');

    // 2. Save audio to file
    const audioPath = path.join(__dirname, '..', 'assets', 'test-bruno-audio.mp3');
    fs.writeFileSync(audioPath, Buffer.from(audioResponse.data));
    console.log(`✅ Áudio salvo: ${audioPath}`);

    console.log('\n📤 Etapa 2: Upload áudio para D-ID...');

    // 3. Upload audio to D-ID
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath));

    const uploadResponse = await axios.post(
      'https://api.d-id.com/audios',
      formData,
      {
        headers: {
          'Authorization': DID_API_KEY,
          ...formData.getHeaders()
        }
      }
    );

    const audioUrl = uploadResponse.data.url;
    console.log('✅ Áudio uploaded:', audioUrl);

    console.log('\n🎭 Etapa 3: Criando vídeo com avatar...');

    // 4. Create video
    const videoResponse = await axios.post(
      'https://api.d-id.com/talks',
      {
        script: {
          type: 'audio',
          audio_url: audioUrl
        },
        source_url: DID_AVATAR_BRUNO_URL,
        config: {
          stitch: true,
          result_format: 'mp4',
          fluent: true
        }
      },
      {
        headers: {
          'Authorization': DID_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const talkId = videoResponse.data.id;
    console.log(`✅ Vídeo iniciado: ${talkId}`);
    console.log('   Aguardando processamento...');

    // 5. Poll for completion
    let status = 'created';
    let videoUrl = null;
    let attempts = 0;

    while (status !== 'done' && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const statusResponse = await axios.get(
        `https://api.d-id.com/talks/${talkId}`,
        {
          headers: {
            'Authorization': DID_API_KEY
          }
        }
      );

      status = statusResponse.data.status;
      videoUrl = statusResponse.data.result_url;
      attempts++;

      process.stdout.write('.');
    }

    console.log('\n');

    if (status === 'done') {
      console.log('════════════════════════════════════════════════════════');
      console.log('✅ SUCESSO! Vídeo gerado com SUA VOZ CLONADA!\n');
      console.log('🎬 URL do Vídeo:', videoUrl);
      console.log('\n📊 Resumo:');
      console.log('   - Avatar: Bruno (D-ID)');
      console.log('   - Voz: CLONADA via ElevenLabs (SUA VOZ!)');
      console.log('   - Voice ID:', ELEVENLABS_VOICE_ID_Bruno);
      console.log('\n🎯 Abra a URL para ver VOCÊ falando!');
      console.log('════════════════════════════════════════════════════════\n');

      // Cleanup
      fs.unlinkSync(audioPath);
    } else {
      console.error('❌ Timeout');
    }

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testWithAudioFile();
