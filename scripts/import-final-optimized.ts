import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface HashtagData {
  hashtag: string;
  total_frequency: number;
  qualified_frequency: number;
  qualification_rate: number;
}

async function importFinalOptimized() {
  console.log('🎯 IMPORTAÇÃO FINAL OTIMIZADA\n');
  console.log('='  .repeat(80));
  console.log('📊 Estratégia:');
  console.log('   • Top 50 Filtrado: As 50 melhores por taxa de qualificação');
  console.log('   • Top 65 Complementar: As 65 restantes do Top 100 geral\n');
  console.log('='  .repeat(80));

  // 1. Deletar registros anteriores
  console.log('\n🗑️  Removendo importações anteriores...');

  await supabase.from('lead_search_terms').delete().eq('generated_by_model', 'real_data_extraction');
  await supabase.from('lead_search_terms').delete().eq('generated_by_model', 'real_data_filtered_exclusive');

  console.log('✅ Registros anteriores removidos\n');

  // 2. Ler CSV Top 100 (todas as leads)
  console.log('📊 Processando Top 100 (todas as leads)...');
  const csv100 = fs.readFileSync(path.join(process.cwd(), 'top_100_hashtags.csv'), 'utf-8');
  const lines100 = csv100.trim().split('\n').slice(1);

  const allHashtags = new Map<string, number>();
  lines100.forEach((line, index) => {
    const [hashtag, frequency] = line.split(',');
    allHashtags.set(hashtag.trim(), index + 1); // Ranking no Top 100
  });

  console.log(`✅ ${allHashtags.size} hashtags do Top 100 carregadas\n`);

  // 3. Ler CSV Top 100 Qualificado e pegar Top 50
  console.log('📊 Processando Top 50 Filtrado (leads qualificados)...');
  const csv50 = fs.readFileSync(path.join(process.cwd(), 'top_100_hashtags_qualified.csv'), 'utf-8');
  const lines50 = csv50.trim().split('\n').slice(1);

  const top50Filtered: Array<{hashtag: string, qualified_freq: number, rank: number}> = [];

  lines50.slice(0, 50).forEach((line, index) => {
    const [hashtag, frequency] = line.split(',');
    top50Filtered.push({
      hashtag: hashtag.trim(),
      qualified_freq: parseInt(frequency.trim()),
      rank: index + 1
    });
  });

  console.log(`✅ ${top50Filtered.length} hashtags do Top 50 Filtrado carregadas\n`);

  // 4. Criar Set das hashtags do Top 50 para fácil lookup
  const top50Set = new Set(top50Filtered.map(h => h.hashtag));

  // 5. Pegar Top 65 Complementar (do Top 100 que NÃO estão no Top 50)
  console.log('📊 Calculando Top 65 Complementar...');
  const top65Complementar: string[] = [];

  lines100.forEach(line => {
    const [hashtag] = line.split(',');
    const hashtagClean = hashtag.trim();

    if (!top50Set.has(hashtagClean)) {
      top65Complementar.push(hashtagClean);
    }
  });

  console.log(`✅ ${top65Complementar.length} hashtags do Top 65 Complementar\n`);

  // 6. Inserir Top 50 Filtrado
  console.log('💾 Inserindo Top 50 Filtrado (1 registro com 50 pares)...');

  const top50Record = {
    categoria_geral: 'Dados Reais Instagram - Top 50 Filtrado',
    area_especifica: 'Top 50 hashtags com melhor taxa de qualificação (leads com email/telefone)',
    target_segment: 'leads_qualificados_top_50',
    search_terms: top50Filtered.map(item => ({
      termo: item.hashtag,
      hashtag: item.hashtag
    })),
    generated_by_model: 'real_data_top50_filtered',
    generation_prompt: `Top 50 hashtags ranqueadas por taxa de qualificação. Total: ${top50Filtered.reduce((sum, h) => sum + h.qualified_freq, 0)} menções em 1.489 leads qualificados.`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: error50 } = await supabase
    .from('lead_search_terms')
    .insert([top50Record]);

  if (error50) {
    console.error('❌ Erro ao inserir Top 50:', error50.message);
    return;
  }

  console.log('✅ Top 50 Filtrado inserido com sucesso!\n');

  // 7. Inserir Top 65 Complementar
  console.log('💾 Inserindo Top 65 Complementar (1 registro com 65 pares)...');

  const top65Record = {
    categoria_geral: 'Dados Reais Instagram - Top 65 Complementar',
    area_especifica: 'Hashtags do Top 100 geral que não entraram no Top 50 Filtrado',
    target_segment: 'leads_gerais_complementar',
    search_terms: top65Complementar.map(hashtag => ({
      termo: hashtag,
      hashtag: hashtag
    })),
    generated_by_model: 'real_data_top65_complementar',
    generation_prompt: `65 hashtags complementares do Top 100 geral (excluindo as que já estão no Top 50 Filtrado). Base: 2.918 leads totais.`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: error65 } = await supabase
    .from('lead_search_terms')
    .insert([top65Record]);

  if (error65) {
    console.error('❌ Erro ao inserir Top 65:', error65.message);
    return;
  }

  console.log('✅ Top 65 Complementar inserido com sucesso!\n');

  // 8. Verificação final
  console.log('='  .repeat(80));
  console.log('📊 VERIFICAÇÃO FINAL:\n');

  const { data: check50 } = await supabase
    .from('lead_search_terms')
    .select('categoria_geral, search_terms')
    .eq('generated_by_model', 'real_data_top50_filtered')
    .single();

  const { data: check65 } = await supabase
    .from('lead_search_terms')
    .select('categoria_geral, search_terms')
    .eq('generated_by_model', 'real_data_top65_complementar')
    .single();

  if (check50) {
    console.log(`✅ Top 50 Filtrado: ${check50.search_terms.length} pares termo/hashtag`);
  }

  if (check65) {
    console.log(`✅ Top 65 Complementar: ${check65.search_terms.length} pares termo/hashtag`);
  }

  const total = (check50?.search_terms.length || 0) + (check65?.search_terms.length || 0);
  console.log(`\n📊 Total de hashtags únicas: ${total}`);

  // 9. Análise das 15 exclusivas
  console.log('\n' + '='  .repeat(80));
  console.log('🎯 HASHTAGS EXCLUSIVAS DO TOP 50 (não estão no Top 100 geral):\n');

  const exclusivas: string[] = [];
  top50Filtered.forEach(item => {
    if (!allHashtags.has(item.hashtag)) {
      exclusivas.push(item.hashtag);
    }
  });

  if (exclusivas.length > 0) {
    exclusivas.forEach((hashtag, idx) => {
      const data = top50Filtered.find(h => h.hashtag === hashtag);
      console.log(`   ${String(idx + 1).padStart(2)}. ${hashtag.padEnd(30)} (${data?.qualified_freq} menções)`);
    });
    console.log(`\n   Total: ${exclusivas.length} hashtags exclusivas (100% qualificação)`);
  } else {
    console.log('   Nenhuma hashtag exclusiva encontrada.');
  }

  console.log('\n' + '='  .repeat(80));
  console.log('🎉 IMPORTAÇÃO FINAL CONCLUÍDA!\n');
  console.log('📋 Estrutura da tabela lead_search_terms:');
  console.log('   • 1 registro: Top 50 Filtrado (50 pares - melhor qualificação)');
  console.log('   • 1 registro: Top 65 Complementar (65 pares - restante do Top 100)');
  console.log(`   • Total: ${total} hashtags únicas sem duplicação`);
  console.log('\n💡 Estratégia otimizada para maximizar leads qualificados!\n');
}

importFinalOptimized().catch(console.error);
