/**
 * Script para baixar músicas instrumentais reais e fazer upload para Supabase Storage
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import http from 'http';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'trending-audios';
const TEMP_DIR = path.join(process.cwd(), 'temp-audios');

// 12 Músicas Instrumentais de Incompetech (Free, CC-BY)
// Kevin MacLeod's music - Licença Creative Commons
const audioSources = [
  {
    name: 'Upbeat-Corporate',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3',
    artist: 'Kevin MacLeod',
    category: 'corporate',
    score: 98
  },
  {
    name: 'Motivational-Success',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funk%20Game%20Loop.mp3',
    artist: 'Kevin MacLeod',
    category: 'corporate',
    score: 95
  },
  {
    name: 'Energetic-Electronic',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pixel%20Peeker%20Polka%20-%20Slower.mp3',
    artist: 'Kevin MacLeod',
    category: 'energetic',
    score: 92
  },
  {
    name: 'Tech-Background',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pamgaea.mp3',
    artist: 'Kevin MacLeod',
    category: 'corporate',
    score: 90
  },
  {
    name: 'Inspiring-Ambient',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Touching%20Moments%20Four%20-%20Melody.mp3',
    artist: 'Kevin MacLeod',
    category: 'trending',
    score: 96
  },
  {
    name: 'Corporate-Innovation',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Deliberate%20Thought.mp3',
    artist: 'Kevin MacLeod',
    category: 'corporate',
    score: 88
  },
  {
    name: 'Uplifting-Piano',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3',
    artist: 'Kevin MacLeod',
    category: 'trending',
    score: 94
  },
  {
    name: 'Energy-Flow',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Backbay%20Lounge.mp3',
    artist: 'Kevin MacLeod',
    category: 'energetic',
    score: 89
  },
  {
    name: 'Modern-Business',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Blue%20Ska.mp3',
    artist: 'Kevin MacLeod',
    category: 'corporate',
    score: 87
  },
  {
    name: 'Chill-Lounge',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Airport%20Lounge.mp3',
    artist: 'Kevin MacLeod',
    category: 'general',
    score: 93
  },
  {
    name: 'Electronic-Pulse',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/EDM%20Detection%20Mode.mp3',
    artist: 'Kevin MacLeod',
    category: 'energetic',
    score: 91
  },
  {
    name: 'Future-Tech',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space%20Jazz.mp3',
    artist: 'Kevin MacLeod',
    category: 'energetic',
    score: 85
  }
];

// Função para download de arquivo
function downloadFile(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Seguir redirect
        const redirectUrl = response.headers.location!;
        file.close();
        fs.unlinkSync(filepath);
        return downloadFile(redirectUrl, filepath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlinkSync(filepath);
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlinkSync(filepath);
      reject(err);
    });
  });
}

async function main() {
  console.log('🎵 Iniciando download e upload de áudios trending...\n');

  try {
    // 1. Criar diretório temporário
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
      console.log(`📁 Diretório criado: ${TEMP_DIR}\n`);
    }

    // 2. Criar bucket no Supabase Storage (se não existir)
    console.log('🪣 Verificando bucket no Supabase Storage...');
    const { data: buckets } = await supabase.storage.listBuckets();

    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!bucketExists) {
      console.log('📦 Criando bucket "trending-audios"...');
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['audio/mpeg', 'audio/mp3']
      });

      if (createError) {
        console.error('❌ Erro ao criar bucket:', createError);
        throw createError;
      }
      console.log('✅ Bucket criado com sucesso!\n');
    } else {
      console.log('✅ Bucket já existe!\n');
    }

    // 3. Download e upload de cada áudio
    const uploadedAudios = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < audioSources.length; i++) {
      const audio = audioSources[i];
      const filename = `${audio.name}.mp3`;
      const filepath = path.join(TEMP_DIR, filename);

      console.log(`\n[${i + 1}/12] 🎵 ${audio.name}`);
      console.log(`   📥 Baixando de: ${audio.url.substring(0, 60)}...`);

      try {
        // Download
        await downloadFile(audio.url, filepath);
        const fileSize = fs.statSync(filepath).size;
        console.log(`   ✅ Download completo (${(fileSize / 1024).toFixed(2)} KB)`);

        // Upload para Supabase
        console.log(`   ☁️  Fazendo upload para Supabase...`);
        const fileBuffer = fs.readFileSync(filepath);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filename, fileBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`   ❌ Erro no upload:`, uploadError);
          failCount++;
          continue;
        }

        // Obter URL pública
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filename);

        const publicUrl = publicUrlData.publicUrl;
        console.log(`   ✅ Upload completo!`);
        console.log(`   🔗 URL: ${publicUrl}`);

        uploadedAudios.push({
          audio_id: `incompetech_${i + 1}`,
          audio_name: audio.name.replace(/-/g, ' '),
          artist_name: audio.artist,
          audio_url: publicUrl,
          category: audio.category,
          trending_score: audio.score,
          is_active: true
        });

        successCount++;

        // Limpar arquivo temporário
        fs.unlinkSync(filepath);

      } catch (error) {
        console.error(`   ❌ Erro:`, error);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`📊 RESULTADO: ${successCount} sucessos, ${failCount} falhas`);
    console.log('='.repeat(70) + '\n');

    if (uploadedAudios.length === 0) {
      console.error('❌ Nenhum áudio foi carregado com sucesso!');
      process.exit(1);
    }

    // 4. Atualizar tabela do banco
    console.log('💾 Atualizando tabela instagram_trending_audios...\n');

    // Limpar tabela
    await supabase
      .from('instagram_trending_audios')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Inserir novos áudios
    const { data: insertData, error: insertError } = await supabase
      .from('instagram_trending_audios')
      .insert(uploadedAudios)
      .select();

    if (insertError) {
      console.error('❌ Erro ao inserir na tabela:', insertError);
      throw insertError;
    }

    console.log(`✅ ${insertData?.length || 0} áudios inseridos na tabela!\n`);

    // 5. Resumo final
    console.log('📋 ÁUDIOS DISPONÍVEIS:\n');
    uploadedAudios.forEach((audio, idx) => {
      console.log(`${idx + 1}. ${audio.audio_name} - ${audio.artist_name}`);
      console.log(`   Categoria: ${audio.category} | Score: ${audio.trending_score}`);
      console.log(`   URL: ${audio.audio_url}\n`);
    });

    // 6. Testar função random
    console.log('🧪 Testando função get_random_trending_audio...');
    const { data: randomAudio, error: rpcError } = await supabase
      .rpc('get_random_trending_audio');

    if (rpcError) {
      console.error('❌ Erro ao testar:', rpcError);
    } else if (randomAudio && randomAudio.length > 0) {
      console.log('✅ Teste bem-sucedido!');
      console.log(`   🎵 Áudio aleatório: ${randomAudio[0].audio_name}`);
      console.log(`   🔗 ${randomAudio[0].audio_url}\n`);
    }

    // Limpar diretório temporário
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmdirSync(TEMP_DIR, { recursive: true });
      console.log('🧹 Diretório temporário removido\n');
    }

    console.log('🎉 PROCESSO CONCLUÍDO COM SUCESSO!');
    console.log('✨ Agora o workflow N8N usará músicas diferentes a cada execução!\n');

  } catch (error) {
    console.error('\n❌ ERRO GERAL:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Falha:', error);
    process.exit(1);
  });
