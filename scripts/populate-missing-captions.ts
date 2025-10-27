/**
 * Script para popular captions e hashtags faltantes das semanas 43 e 44
 * Gera conteúdo genérico baseado nos temas principais
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface EditorialContent {
  id: string;
  week_number: number;
  main_theme: string;
  reel_1_sub_theme: string;
  reel_2_sub_theme: string;
  reel_3_sub_theme: string;
}

async function generateCaptionsAndHashtags() {
  console.log('🔍 Buscando conteúdo das semanas 43 e 44...\n');

  // Buscar dados das semanas 43 e 44
  const { data: weeks, error } = await supabase
    .from('editorial_content')
    .select('id, week_number, main_theme, reel_1_sub_theme, reel_2_sub_theme, reel_3_sub_theme')
    .in('week_number', [43, 44])
    .order('week_number');

  if (error || !weeks || weeks.length === 0) {
    console.error('❌ Erro ao buscar semanas:', error);
    process.exit(1);
  }

  console.log(`✅ ${weeks.length} semana(s) encontrada(s)\n`);

  for (const week of weeks) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📅 SEMANA ${week.week_number} - ${week.main_theme}`);
    console.log(`${'='.repeat(70)}\n`);

    // Gerar captions e hashtags para cada reel
    const updates: any = {
      youtube_caption: `Conteúdo exclusivo sobre ${week.main_theme}! 🚀\n\n✨ Teste 7 dias grátis → link na bio\n\n📲 Transforme sua gestão de clientes com IA\n\n#UBSTaylorMade #GestaoInteligente #MarketingDigital`
    };

    // Reel 1 - Foco no problema/urgência
    const mainThemeShort = week.main_theme.length > 100
      ? week.main_theme.substring(0, 100) + '...'
      : week.main_theme;

    updates.reel_1_instagram_caption = `⚠️ Você sabia?\n\n${mainThemeShort}\n\n💡 Descubra a solução completa!\n\n✨ Teste grátis por 7 dias → link na bio`;
    updates.reel_1_instagram_hashtags = [
      'marketingdigital',
      'empreendedorismo',
      'negocios',
      'gestao',
      'produtividade',
      'sucessoempresarial',
      'inteligenciaartificial',
      'automacao'
    ];

    // Reel 2 - Foco na solução
    updates.reel_2_instagram_caption = `🚀 A solução que você precisa!\n\n${mainThemeShort}\n\n🎯 Transforme sua gestão de clientes com IA\n\n📲 Comece hoje → link na bio`;
    updates.reel_2_instagram_hashtags = [
      'dicas',
      'estrategia',
      'crescimento',
      'vendas',
      'marketingdeconteudo',
      'transformacaodigital',
      'inovacao',
      'resultados'
    ];

    // Reel 3 - Foco em resultados/CTA
    updates.reel_3_instagram_caption = `✨ Resultados comprovados!\n\n${mainThemeShort}\n\n🎁 Experimente GRÁTIS por 7 dias\n\n👉 Link na bio`;
    updates.reel_3_instagram_hashtags = [
      'solucoes',
      'tecnologia',
      'ferramentasdigitais',
      'otimizacao',
      'eficiencia',
      'businessintelligence',
      'saas',
      'cloudsolutions'
    ];

    console.log('📝 Captions gerados:');
    console.log(`   Reel 1: ${updates.reel_1_instagram_caption?.substring(0, 60)}...`);
    console.log(`   Reel 2: ${updates.reel_2_instagram_caption?.substring(0, 60)}...`);
    console.log(`   Reel 3: ${updates.reel_3_instagram_caption?.substring(0, 60)}...`);
    console.log(`   YouTube: ${updates.youtube_caption?.substring(0, 60)}...`);

    console.log('\n🏷️ Hashtags gerados:');
    if (updates.reel_1_instagram_hashtags) {
      const tags1 = updates.reel_1_instagram_hashtags;
      console.log(`   Reel 1: #${tags1.slice(0, 3).join(' #')}... (${tags1.length} total)`);
    }
    if (updates.reel_2_instagram_hashtags) {
      const tags2 = updates.reel_2_instagram_hashtags;
      console.log(`   Reel 2: #${tags2.slice(0, 3).join(' #')}... (${tags2.length} total)`);
    }
    if (updates.reel_3_instagram_hashtags) {
      const tags3 = updates.reel_3_instagram_hashtags;
      console.log(`   Reel 3: #${tags3.slice(0, 3).join(' #')}... (${tags3.length} total)`);
    }

    // Atualizar banco de dados
    console.log('\n💾 Atualizando banco de dados...');
    const { error: updateError } = await supabase
      .from('editorial_content')
      .update(updates)
      .eq('id', week.id);

    if (updateError) {
      console.error(`❌ Erro ao atualizar semana ${week.week_number}:`, updateError);
      continue;
    }

    console.log(`✅ Semana ${week.week_number} atualizada com sucesso!`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎉 PROCESSO CONCLUÍDO!');
  console.log('='.repeat(70));
  console.log('\n📋 Próximos passos:');
  console.log('   1. ✅ Captions e hashtags populados');
  console.log('   2. ✅ YouTube descriptions atualizadas');
  console.log('   3. 🔄 Atualize a página de aprovação para ver as mudanças');
  console.log('   4. 📝 Revise e edite os textos conforme necessário\n');
}

generateCaptionsAndHashtags()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Erro fatal:', error);
    process.exit(1);
  });
