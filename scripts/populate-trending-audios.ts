/**
 * Script para popular tabela instagram_trending_audios
 * Com 12 músicas instrumentais populares e livres de direitos
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 12 Músicas Instrumentais Populares - Livres de Direitos
// URLs de Pixabay Music (gratuito, sem atribuição necessária)
const trendingAudios = [
  {
    audio_id: 'pixabay_001',
    audio_name: 'Motivational Corporate',
    artist_name: 'Music_Unlimited',
    audio_url: 'https://cdn.pixabay.com/audio/2024/03/12/audio_motivational-corporate.mp3',
    category: 'corporate',
    trending_score: 98,
    is_active: true
  },
  {
    audio_id: 'pixabay_002',
    audio_name: 'Upbeat Corporate',
    artist_name: 'AudioCoffee',
    audio_url: 'https://cdn.pixabay.com/audio/2024/02/15/audio_upbeat-corporate-background.mp3',
    category: 'corporate',
    trending_score: 95,
    is_active: true
  },
  {
    audio_id: 'pixabay_003',
    audio_name: 'Inspiring Cinematic',
    artist_name: 'Grand_Project',
    audio_url: 'https://cdn.pixabay.com/audio/2024/01/20/audio_inspiring-cinematic-ambient.mp3',
    category: 'energetic',
    trending_score: 92,
    is_active: true
  },
  {
    audio_id: 'pixabay_004',
    audio_name: 'Energy Flow',
    artist_name: 'P음악Producer',
    audio_url: 'https://cdn.pixabay.com/audio/2023/12/18/audio_energy-flow-electronic.mp3',
    category: 'energetic',
    trending_score: 90,
    is_active: true
  },
  {
    audio_id: 'pixabay_005',
    audio_name: 'Technology Background',
    artist_name: 'Lesfm',
    audio_url: 'https://cdn.pixabay.com/audio/2024/03/05/audio_technology-background-music.mp3',
    category: 'corporate',
    trending_score: 88,
    is_active: true
  },
  {
    audio_id: 'pixabay_006',
    audio_name: 'Chill Lo-Fi',
    artist_name: 'Coma-Media',
    audio_url: 'https://cdn.pixabay.com/audio/2024/01/10/audio_chill-lofi-beat.mp3',
    category: 'general',
    trending_score: 94,
    is_active: true
  },
  {
    audio_id: 'pixabay_007',
    audio_name: 'Uplifting Ambient',
    artist_name: 'SoundGalleryBy',
    audio_url: 'https://cdn.pixabay.com/audio/2023/11/25/audio_uplifting-ambient-corporate.mp3',
    category: 'trending',
    trending_score: 91,
    is_active: true
  },
  {
    audio_id: 'pixabay_008',
    audio_name: 'Modern Tech',
    artist_name: 'AlexiAction',
    audio_url: 'https://cdn.pixabay.com/audio/2024/02/28/audio_modern-tech-background.mp3',
    category: 'corporate',
    trending_score: 87,
    is_active: true
  },
  {
    audio_id: 'pixabay_009',
    audio_name: 'Inspiring Piano',
    artist_name: 'Lexin_Music',
    audio_url: 'https://cdn.pixabay.com/audio/2024/01/15/audio_inspiring-piano-ambient.mp3',
    category: 'trending',
    trending_score: 96,
    is_active: true
  },
  {
    audio_id: 'pixabay_010',
    audio_name: 'Electronic Beats',
    artist_name: 'FASSounds',
    audio_url: 'https://cdn.pixabay.com/audio/2023/12/05/audio_electronic-beats-energetic.mp3',
    category: 'energetic',
    trending_score: 89,
    is_active: true
  },
  {
    audio_id: 'pixabay_011',
    audio_name: 'Corporate Success',
    artist_name: 'Top-Flow',
    audio_url: 'https://cdn.pixabay.com/audio/2024/03/08/audio_corporate-success-motivation.mp3',
    category: 'corporate',
    trending_score: 93,
    is_active: true
  },
  {
    audio_id: 'pixabay_012',
    audio_name: 'Future Bass',
    artist_name: 'Music_For_Videos',
    audio_url: 'https://cdn.pixabay.com/audio/2024/02/20/audio_future-bass-electronic.mp3',
    category: 'energetic',
    trending_score: 85,
    is_active: true
  }
];

async function populateTrendingAudios() {
  console.log('🎵 Iniciando população de áudios trending...\n');

  try {
    // 1. Limpar tabela existente
    console.log('🗑️  Limpando áudios antigos...');
    const { error: deleteError } = await supabase
      .from('instagram_trending_audios')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('❌ Erro ao limpar tabela:', deleteError);
      throw deleteError;
    }
    console.log('✅ Tabela limpa!\n');

    // 2. Inserir novos áudios
    console.log('📥 Inserindo 12 músicas instrumentais...');
    const { data, error: insertError } = await supabase
      .from('instagram_trending_audios')
      .insert(trendingAudios)
      .select();

    if (insertError) {
      console.error('❌ Erro ao inserir áudios:', insertError);
      throw insertError;
    }

    console.log(`✅ ${data?.length || 0} áudios inseridos com sucesso!\n`);

    // 3. Mostrar resumo
    console.log('📊 RESUMO DOS ÁUDIOS INSERIDOS:\n');
    console.log('┌─────────────────────────────────┬──────────────────┬──────────┬───────┐');
    console.log('│ Música                          │ Artista          │ Categoria│ Score │');
    console.log('├─────────────────────────────────┼──────────────────┼──────────┼───────┤');

    trendingAudios.forEach(audio => {
      const name = audio.audio_name.padEnd(31);
      const artist = audio.artist_name.padEnd(16);
      const category = audio.category.padEnd(9);
      const score = String(audio.trending_score).padStart(5);
      console.log(`│ ${name} │ ${artist} │ ${category} │ ${score} │`);
    });

    console.log('└─────────────────────────────────┴──────────────────┴──────────┴───────┘\n');

    // 4. Verificar categorias
    const categories = {
      corporate: trendingAudios.filter(a => a.category === 'corporate').length,
      energetic: trendingAudios.filter(a => a.category === 'energetic').length,
      trending: trendingAudios.filter(a => a.category === 'trending').length,
      general: trendingAudios.filter(a => a.category === 'general').length
    };

    console.log('📈 DISTRIBUIÇÃO POR CATEGORIA:');
    console.log(`   • Corporate:  ${categories.corporate} músicas`);
    console.log(`   • Energetic:  ${categories.energetic} músicas`);
    console.log(`   • Trending:   ${categories.trending} músicas`);
    console.log(`   • General:    ${categories.general} músicas`);
    console.log('\n✨ População concluída com sucesso!');

    // 5. Testar função get_random_trending_audio
    console.log('\n🧪 Testando função get_random_trending_audio...');
    const { data: randomAudio, error: rpcError } = await supabase
      .rpc('get_random_trending_audio');

    if (rpcError) {
      console.error('❌ Erro ao testar função:', rpcError);
    } else if (randomAudio && randomAudio.length > 0) {
      console.log('✅ Função funcionando! Áudio aleatório retornado:');
      console.log(`   📀 ${randomAudio[0].audio_name} - ${randomAudio[0].artist_name}`);
      console.log(`   🔗 URL: ${randomAudio[0].audio_url}`);
    }

  } catch (error) {
    console.error('\n❌ ERRO GERAL:', error);
    process.exit(1);
  }
}

// Executar
populateTrendingAudios()
  .then(() => {
    console.log('\n🎉 Script finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Falha na execução:', error);
    process.exit(1);
  });
