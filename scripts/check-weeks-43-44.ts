/**
 * Script para verificar dados das semanas 43 e 44
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWeeks() {
  console.log('🔍 Verificando dados das semanas 43 e 44...\n');

  const { data: weeks, error } = await supabase
    .from('editorial_content')
    .select(`
      week_number,
      main_theme,
      reel_1_sub_theme,
      reel_2_sub_theme,
      reel_3_sub_theme,
      reel_1_instagram_caption,
      reel_2_instagram_caption,
      reel_3_instagram_caption,
      youtube_caption
    `)
    .in('week_number', [43, 44])
    .order('week_number');

  if (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }

  if (!weeks || weeks.length === 0) {
    console.log('❌ Nenhuma semana encontrada');
    process.exit(1);
  }

  for (const week of weeks) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📅 SEMANA ${week.week_number}`);
    console.log(`${'='.repeat(70)}\n`);

    console.log(`📝 Main Theme: ${week.main_theme || 'NULL'}`);
    console.log(`\n🎬 Sub-themes:`);
    console.log(`   Reel 1: ${week.reel_1_sub_theme || 'NULL'}`);
    console.log(`   Reel 2: ${week.reel_2_sub_theme || 'NULL'}`);
    console.log(`   Reel 3: ${week.reel_3_sub_theme || 'NULL'}`);

    console.log(`\n📱 Instagram Captions:`);
    console.log(`   Reel 1: ${week.reel_1_instagram_caption ? week.reel_1_instagram_caption.substring(0, 50) + '...' : 'NULL'}`);
    console.log(`   Reel 2: ${week.reel_2_instagram_caption ? week.reel_2_instagram_caption.substring(0, 50) + '...' : 'NULL'}`);
    console.log(`   Reel 3: ${week.reel_3_instagram_caption ? week.reel_3_instagram_caption.substring(0, 50) + '...' : 'NULL'}`);

    console.log(`\n📺 YouTube Caption:`);
    console.log(`   ${week.youtube_caption ? week.youtube_caption.substring(0, 80) + '...' : 'NULL'}`);
  }

  console.log(`\n${'='.repeat(70)}\n`);
}

checkWeeks()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Erro:', error);
    process.exit(1);
  });
