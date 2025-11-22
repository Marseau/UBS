import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkWeek46Reel1() {
  console.log('🔍 Verificando status do Reel 1 da Semana 46...\n');

  const { data, error } = await supabase
    .from('editorial_content')
    .select(`
      id,
      week_number,
      year,
      reel_1_sub_theme,
      reel_1_video_url,
      reel_1_approved,
      reel_1_published,
      reel_1_published_at,
      reel_1_instagram_id
    `)
    .eq('week_number', 46)
    .eq('year', 2025)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Erro:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  Nenhum registro encontrado para semana 46/2025');
    return;
  }

  console.log(`📊 Total de registros: ${data.length}\n`);

  data.forEach((record, idx) => {
    console.log(`--- Registro ${idx + 1} ---`);
    console.log(`ID: ${record.id}`);
    console.log(`Tema: ${record.reel_1_sub_theme || 'N/A'}`);
    console.log(`Video URL: ${record.reel_1_video_url ? '✅ PRESENTE' : '❌ NULL'}`);
    console.log(`Aprovado: ${record.reel_1_approved ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`Publicado: ${record.reel_1_published ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`Publicado em: ${record.reel_1_published_at || 'N/A'}`);
    console.log(`Instagram ID: ${record.reel_1_instagram_id || 'N/A'}`);

    if (record.reel_1_video_url) {
      console.log(`URL completa: ${record.reel_1_video_url.substring(0, 80)}...`);
    }

    console.log('');
  });

  // Verificar qual é o registro válido para publicação
  const validForPublish = data.filter(r =>
    r.reel_1_video_url &&
    r.reel_1_approved &&
    !r.reel_1_published
  );

  console.log('\n✅ Registros VÁLIDOS para publicação:', validForPublish.length);

  if (validForPublish.length > 0) {
    console.log('\n🎯 Registro que DEVE ser publicado:');
    validForPublish.forEach(r => {
      console.log(`   ID: ${r.id}`);
      console.log(`   Tema: ${r.reel_1_sub_theme}`);
    });
  }
}

checkWeek46Reel1().catch(console.error);
