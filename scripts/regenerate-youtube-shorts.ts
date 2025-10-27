/**
 * Script para regenerar YouTube Shorts das semanas 43 e 44
 * Resolve problema de sobrescrita de arquivos
 */

// CRITICAL: Load dotenv FIRST before any other imports
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { VideoConcatenationService } from '../src/services/video-concatenation.service';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface WeekData {
  week_number: number;
  id: string;
  main_theme: string;
  reel_1_video_url: string;
  reel_2_video_url: string;
  reel_3_video_url: string;
  youtube_caption: string;
}

async function getWeekData(weekNumber: number): Promise<WeekData | null> {
  const { data, error } = await supabase
    .from('editorial_content')
    .select('id, week_number, main_theme, reel_1_video_url, reel_2_video_url, reel_3_video_url, youtube_caption')
    .eq('week_number', weekNumber)
    .single();

  if (error) {
    console.error(`❌ Erro ao buscar dados da semana ${weekNumber}:`, error);
    return null;
  }

  return data;
}

async function regenerateYouTubeShort(weekData: WeekData): Promise<string | null> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎬 REGENERANDO YOUTUBE SHORT - SEMANA ${weekData.week_number}`);
  console.log(`${'='.repeat(70)}\n`);

  console.log(`📝 Tema: ${weekData.main_theme}`);
  console.log(`\n📹 Reels:`);
  console.log(`   1️⃣ ${weekData.reel_1_video_url}`);
  console.log(`   2️⃣ ${weekData.reel_2_video_url}`);
  console.log(`   3️⃣ ${weekData.reel_3_video_url}\n`);

  try {
    const videoService = new VideoConcatenationService();

    const videoUrls = [
      weekData.reel_1_video_url,
      weekData.reel_2_video_url,
      weekData.reel_3_video_url
    ];

    // Validate URLs
    if (!videoUrls[0] || !videoUrls[1] || !videoUrls[2]) {
      throw new Error('Um ou mais URLs de reels estão faltando!');
    }

    // Nome único incluindo week_number
    const outputName = `youtube_short_week_${weekData.week_number}`;
    const youtubeCaption = weekData.youtube_caption || `Conteúdo da semana ${weekData.week_number}`;

    console.log(`🎯 Nome do arquivo: ${outputName}_TIMESTAMP.mp4`);
    console.log(`📝 Caption: ${youtubeCaption.substring(0, 100)}...\n`);

    console.log(`⚙️ Iniciando concatenação com crossfade...\n`);

    const result = await videoService.concatenateYouTubeShort(
      videoUrls,
      outputName,
      youtubeCaption,
      [0, 1], // Remove CTA dos vídeos 0 e 1
      2       // Mantém CTA no vídeo 2
    );

    console.log(`\n✅ YouTube Short gerado com sucesso!`);
    console.log(`   🔗 URL: ${result.youtube_short_url}`);
    console.log(`   ⏱️  Duração: ${result.duration_seconds}s`);
    console.log(`   📦 Tamanho: ${result.file_size_mb} MB`);
    console.log(`   💰 Custo estimado: $${result.cost_usd}\n`);

    return result.youtube_short_url || null;

  } catch (error) {
    console.error(`\n❌ ERRO ao regenerar YouTube Short da semana ${weekData.week_number}:`);
    console.error(error);
    return null;
  }
}

async function updateDatabase(weekNumber: number, youtubeShortUrl: string): Promise<boolean> {
  console.log(`💾 Atualizando banco de dados - Semana ${weekNumber}...`);

  const { error } = await supabase
    .from('editorial_content')
    .update({
      youtube_short_url: youtubeShortUrl,
      updated_at: new Date().toISOString()
    })
    .eq('week_number', weekNumber);

  if (error) {
    console.error(`❌ Erro ao atualizar banco:`, error);
    return false;
  }

  console.log(`✅ Banco de dados atualizado!\n`);
  return true;
}

async function main() {
  console.log('🚀 INICIANDO REGENERAÇÃO DE YOUTUBE SHORTS\n');
  console.log('📋 Problema identificado:');
  console.log('   - Semanas 43 e 44 usavam o mesmo nome de arquivo');
  console.log('   - Semana 44 sobrescreveu a semana 43');
  console.log('   - Solução: Regenerar com nomes únicos incluindo week_number\n');

  const results = {
    week43: { success: false, url: '' },
    week44: { success: false, url: '' }
  };

  // ========== SEMANA 43 ==========
  console.log('1️⃣ PROCESSANDO SEMANA 43\n');
  const week43Data = await getWeekData(43);

  if (!week43Data) {
    console.error('❌ Não foi possível obter dados da semana 43\n');
  } else {
    const week43Url = await regenerateYouTubeShort(week43Data);

    if (week43Url) {
      const updated = await updateDatabase(43, week43Url);
      results.week43 = { success: updated, url: week43Url };
    }
  }

  // ========== SEMANA 44 ==========
  console.log('\n2️⃣ PROCESSANDO SEMANA 44\n');
  const week44Data = await getWeekData(44);

  if (!week44Data) {
    console.error('❌ Não foi possível obter dados da semana 44\n');
  } else {
    const week44Url = await regenerateYouTubeShort(week44Data);

    if (week44Url) {
      const updated = await updateDatabase(44, week44Url);
      results.week44 = { success: updated, url: week44Url };
    }
  }

  // ========== RESUMO FINAL ==========
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMO FINAL');
  console.log('='.repeat(70) + '\n');

  console.log(`Semana 43:`);
  if (results.week43.success) {
    console.log(`   ✅ Regenerado com sucesso`);
    console.log(`   🔗 ${results.week43.url}\n`);
  } else {
    console.log(`   ❌ Falhou\n`);
  }

  console.log(`Semana 44:`);
  if (results.week44.success) {
    console.log(`   ✅ Regenerado com sucesso`);
    console.log(`   🔗 ${results.week44.url}\n`);
  } else {
    console.log(`   ❌ Falhou\n`);
  }

  if (results.week43.success && results.week44.success) {
    console.log('🎉 SUCESSO TOTAL! Ambos os YouTube Shorts foram regenerados.');
    console.log('\n📝 PRÓXIMOS PASSOS:');
    console.log('   1. ✅ YouTube Shorts estão salvos no Supabase Storage');
    console.log('   2. ✅ Banco de dados atualizado com novas URLs');
    console.log('   3. ⏳ Publicar ambos no YouTube via workflow N8N');
    console.log('   4. ⏳ Corrigir workflow para usar nomes únicos no futuro\n');
  } else {
    console.log('⚠️ Alguns problemas ocorreram. Verifique os logs acima.\n');
  }

  // Verificar arquivos no Storage
  console.log('🔍 Verificando arquivos no Supabase Storage...\n');
  const { data: files, error: listError } = await supabase.storage
    .from('instagram-reels')
    .list('youtube-shorts', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (listError) {
    console.error('❌ Erro ao listar arquivos:', listError);
  } else {
    const week43Files = files?.filter(f => f.name.includes('week_43'));
    const week44Files = files?.filter(f => f.name.includes('week_44'));

    console.log(`📂 Arquivos encontrados:`);
    console.log(`   Semana 43: ${week43Files?.length || 0} arquivo(s)`);
    week43Files?.forEach(f => {
      console.log(`      - ${f.name} (${(f.metadata?.size / 1024 / 1024).toFixed(2)} MB)`);
    });

    console.log(`   Semana 44: ${week44Files?.length || 0} arquivo(s)`);
    week44Files?.forEach(f => {
      console.log(`      - ${f.name} (${(f.metadata?.size / 1024 / 1024).toFixed(2)} MB)`);
    });
  }

  console.log('\n✨ Script finalizado!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Erro fatal:', error);
    process.exit(1);
  });
