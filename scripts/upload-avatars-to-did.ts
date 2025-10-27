#!/usr/bin/env ts-node

/**
 * Upload avatares Carla e Bruno para D-ID
 *
 * Uso:
 * 1. As fotos já estão em: /assets/Carla.png e /assets/Bruno.jpg
 * 2. Execute: npx ts-node scripts/upload-avatars-to-did.ts
 * 3. Copie as URLs retornadas para o .env
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DID_API_KEY = process.env.DID_API_KEY;

if (!DID_API_KEY) {
  console.error('❌ DID_API_KEY não encontrada no .env');
  process.exit(1);
}

interface UploadResult {
  name: string;
  url: string;
}

async function uploadAvatarToDID(imagePath: string, name: string): Promise<string> {
  console.log(`\n📤 Uploading ${name}...`);

  if (!fs.existsSync(imagePath)) {
    throw new Error(`❌ Arquivo não encontrado: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const formData = new FormData();
  const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  formData.append('image', imageBuffer, {
    filename: path.basename(imagePath),
    contentType: contentType
  });

  try {
    const response = await axios.post(
      'https://api.d-id.com/images',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${DID_API_KEY}`,
          ...formData.getHeaders()
        }
      }
    );

    const avatarUrl = response.data.url;
    console.log(`✅ ${name} uploaded successfully!`);
    console.log(`   URL: ${avatarUrl}`);

    return avatarUrl;

  } catch (error: any) {
    console.error(`❌ Erro ao fazer upload de ${name}:`, error.response?.data || error.message);
    throw error;
  }
}

async function testAvatar(avatarUrl: string, name: string, voiceId: string): Promise<string> {
  console.log(`\n🎬 Testando avatar ${name}...`);

  const testScript = name === 'Carla'
    ? 'Olá! Sou a Carla. Vou apresentar os problemas que você enfrenta no dia a dia.'
    : 'Olá! Sou o Bruno, especialista do UBS Taylor Made. Vou te mostrar as soluções.';

  try {
    const response = await axios.post(
      'https://api.d-id.com/talks',
      {
        script: {
          type: 'text',
          input: testScript,
          provider: {
            type: 'microsoft',
            voice_id: voiceId
          }
        },
        source_url: avatarUrl,
        config: {
          stitch: true,
          result_format: 'mp4',
          fluent: true
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${DID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const talkId = response.data.id;
    console.log(`   Talk ID: ${talkId}`);
    console.log(`   Aguardando geração...`);

    // Poll for completion
    let status = 'created';
    let videoUrl = null;
    let attempts = 0;

    while (status !== 'done' && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await axios.get(
        `https://api.d-id.com/talks/${talkId}`,
        {
          headers: {
            'Authorization': `Bearer ${DID_API_KEY}`
          }
        }
      );

      status = statusResponse.data.status;
      videoUrl = statusResponse.data.result_url;
      attempts++;

      if (status === 'done') {
        console.log(`✅ Vídeo de teste gerado!`);
        console.log(`   URL: ${videoUrl}`);
        return videoUrl;
      }
    }

    throw new Error('Timeout ao gerar vídeo de teste');

  } catch (error: any) {
    console.error(`❌ Erro ao testar ${name}:`, error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('🎭 Upload de Avatares para D-ID\n');
  console.log('════════════════════════════════════════════════════════\n');

  const avatarsDir = path.join(__dirname, '..', 'assets');
  const carlaPath = path.join(avatarsDir, 'Carla.png');
  const brunoPath = path.join(avatarsDir, 'Bruno.jpg');

  const results: UploadResult[] = [];

  try {
    // 1. Upload Carla
    const carlaUrl = await uploadAvatarToDID(carlaPath, 'Carla');
    results.push({ name: 'Carla', url: carlaUrl });

    // 2. Upload Bruno
    const brunoUrl = await uploadAvatarToDID(brunoPath, 'Bruno');
    results.push({ name: 'Bruno', url: brunoUrl });

    console.log('\n════════════════════════════════════════════════════════');
    console.log('✅ UPLOAD CONCLUÍDO!\n');

    // 3. Test avatars
    console.log('🧪 Gerando vídeos de teste...\n');

    const carlaTestVideo = await testAvatar(
      carlaUrl,
      'Carla',
      'pt-BR-FranciscaNeural'
    );

    const brunoTestVideo = await testAvatar(
      brunoUrl,
      'Bruno',
      'pt-BR-AntonioNeural'
    );

    // 4. Summary
    console.log('\n════════════════════════════════════════════════════════');
    console.log('📋 RESUMO\n');

    console.log('🎭 Carla:');
    console.log(`   Avatar URL: ${carlaUrl}`);
    console.log(`   Test Video: ${carlaTestVideo}\n`);

    console.log('🎭 Bruno:');
    console.log(`   Avatar URL: ${brunoUrl}`);
    console.log(`   Test Video: ${brunoTestVideo}\n`);

    // 5. .env instructions
    console.log('════════════════════════════════════════════════════════');
    console.log('📝 ADICIONE AO SEU .env:\n');
    console.log(`DID_AVATAR_CARLA_URL=${carlaUrl}`);
    console.log(`DID_AVATAR_BRUNO_URL=${brunoUrl}`);
    console.log('\n════════════════════════════════════════════════════════\n');

    console.log('✅ Tudo pronto! Agora você pode gerar vídeos dual persona.');
    console.log('🎬 Assista aos vídeos de teste para validar qualidade.\n');

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message);
    process.exit(1);
  }
}

main();
