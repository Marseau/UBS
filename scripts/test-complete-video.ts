#!/usr/bin/env ts-node

/**
 * Teste completo: Avatar D-ID + Voz Clonada ElevenLabs
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID_Bruno = process.env.ELEVENLABS_VOICE_ID_Bruno;
const DID_API_KEY = process.env.DID_API_KEY;
const DID_AVATAR_BRUNO_URL = process.env.DID_AVATAR_BRUNO_URL;

async function testCompleteVideo() {
  console.log('🎬 Teste Completo: Avatar + Voz Clonada\n');
  console.log('════════════════════════════════════════════════════════\n');

  const script = 'Olá! Sou o Bruno, especialista do UBS Taylor Made. Nossa IA responde leads em 3 segundos, 24 horas por dia, 7 dias por semana.';

  console.log('📝 Script:', script);
  console.log('\n🎤 Etapa 1: Gerando áudio com voz clonada...');

  try {
    // 1. Generate audio with ElevenLabs
    const audioResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID_Bruno}`,
      {
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
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

    console.log('✅ Áudio gerado com voz clonada!');
    console.log(`   Tamanho: ${audioResponse.data.byteLength} bytes`);

    // 2. Convert to base64
    const audioBase64 = Buffer.from(audioResponse.data).toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${audioBase64}`;

    console.log('\n🎭 Etapa 2: Criando vídeo com avatar D-ID...');

    // 3. Create video with D-ID
    const videoResponse = await axios.post(
      'https://api.d-id.com/talks',
      {
        script: {
          type: 'audio',
          audio_url: audioDataUri
        },
        source_url: DID_AVATAR_BRUNO_URL,
        config: {
          stitch: true,
          result_format: 'mp4',
          fluent: true,
          pad_audio: 0.0
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
    console.log(`✅ Vídeo iniciado! Talk ID: ${talkId}`);
    console.log('   Aguardando processamento...');

    // 4. Poll for completion
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
      console.log('✅ SUCESSO! Vídeo gerado!\n');
      console.log('🎬 URL do Vídeo:', videoUrl);
      console.log('\n📊 Resumo:');
      console.log('   - Avatar: Bruno (D-ID)');
      console.log('   - Voz: Clonada ElevenLabs (sua voz)');
      console.log('   - Duração: ~10-12 segundos');
      console.log('   - Formato: MP4');
      console.log('\n🎯 Abra a URL acima para assistir o vídeo!');
      console.log('════════════════════════════════════════════════════════\n');
    } else {
      console.error('❌ Timeout ao gerar vídeo');
    }

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCompleteVideo();
