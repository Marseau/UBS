import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPreviousWeeks() {
  console.log('🔍 Investigando semanas anteriores (43, 44, 45)...\n');

  for (const week of [43, 44, 45]) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 SEMANA ${week}/2025`);
    console.log('='.repeat(60));

    const { data, error } = await supabase
      .from('editorial_content')
      .select(`
        id,
        week_number,
        year,
        created_at,
        reel_1_sub_theme,
        reel_1_video_url,
        reel_1_approved,
        reel_1_published,
        reel_1_published_at
      `)
      .eq('week_number', week)
      .eq('year', 2025);

    if (error) {
      console.error(`❌ Erro na semana ${week}:`, error);
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`⚠️  Nenhum registro encontrado`);
      continue;
    }

    console.log(`📊 Total de registros: ${data.length}\n`);

    data.forEach((record, idx) => {
      console.log(`--- Registro ${idx + 1} (criado: ${new Date(record.created_at).toLocaleString('pt-BR')}) ---`);
      console.log(`   ID: ${record.id.substring(0, 8)}...`);
      console.log(`   Tema: ${record.reel_1_sub_theme || 'N/A'}`);
      console.log(`   Video URL: ${record.reel_1_video_url ? '✅' : '❌'}`);
      console.log(`   Aprovado: ${record.reel_1_approved ? '✅' : '❌'}`);
      console.log(`   Publicado: ${record.reel_1_published ? '✅' : '❌'}`);
      if (record.reel_1_published_at) {
        console.log(`   Publicado em: ${new Date(record.reel_1_published_at).toLocaleString('pt-BR')}`);
      }
      console.log('');
    });

    // Análise
    const withVideo = data.filter(r => r.reel_1_video_url).length;
    const approved = data.filter(r => r.reel_1_approved).length;
    const published = data.filter(r => r.reel_1_published).length;

    console.log(`📈 Resumo Semana ${week}:`);
    console.log(`   - Total de registros: ${data.length}`);
    console.log(`   - Com vídeo gerado: ${withVideo}`);
    console.log(`   - Aprovados: ${approved}`);
    console.log(`   - Publicados: ${published}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔎 DIFERENÇA CRÍTICA:');
  console.log('='.repeat(60));
  console.log('Se semanas anteriores tinham APENAS 1 registro,');
  console.log('mas semana 46 tem 4 registros, o workflow NÃO');
  console.log('tem lógica para lidar com MÚLTIPLOS registros!');
  console.log('');
  console.log('O Supabase retorna um ARRAY de registros, mas o');
  console.log('workflow pega apenas o PRIMEIRO item do array.');
  console.log('Se o primeiro item não tem vídeo → FALHA!');
}

checkPreviousWeeks().catch(console.error);
