import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function importFinalCorrect() {
  console.log('🎯 IMPORTAÇÃO FINAL CORRIGIDA\n');
  console.log('='  .repeat(80));

  // 1. Deletar registros anteriores
  console.log('🗑️  Removendo importações anteriores...');
  await supabase.from('lead_search_terms').delete().eq('generated_by_model', 'real_data_top50_filtered');
  await supabase.from('lead_search_terms').delete().eq('generated_by_model', 'real_data_top65_complementar');
  console.log('✅ Registros anteriores removidos\n');

  // 2. Ler CSV Top 100 (todas as leads)
  console.log('📊 Lendo Top 100 (todas as leads)...');
  const csv100 = fs.readFileSync(path.join(process.cwd(), 'top_100_hashtags.csv'), 'utf-8');
  const lines100 = csv100.trim().split('\n').slice(1);

  const allHashtags = lines100.map(line => line.split(',')[0].trim());
  console.log(`✅ ${allHashtags.length} hashtags carregadas\n`);

  // 3. Ler CSV Top 100 Qualificado (leads com contato)
  console.log('📊 Lendo Top 100 Qualificado (leads com contato)...');
  const csvQualified = fs.readFileSync(path.join(process.cwd(), 'top_100_hashtags_qualified.csv'), 'utf-8');
  const linesQualified = csvQualified.trim().split('\n').slice(1);

  const allQualifiedHashtags = linesQualified.map(line => line.split(',')[0].trim());
  console.log(`✅ ${allQualifiedHashtags.length} hashtags qualificadas carregadas\n`);

  // 4. Top 50 Filtrado: Primeiras 50 do CSV qualificado
  const top50Filtered = allQualifiedHashtags.slice(0, 50);
  console.log(`📊 Top 50 Filtrado: ${top50Filtered.length} hashtags`);

  // 5. Top 65 Complementar: As do Top 100 geral que NÃO estão no Top 50 Filtrado
  const top50Set = new Set(top50Filtered);
  const top65Complementar = allHashtags.filter(h => !top50Set.has(h));

  console.log(`📊 Top 65 Complementar: ${top65Complementar.length} hashtags`);
  console.log(`\n📊 Total: ${top50Filtered.length + top65Complementar.length} hashtags únicas\n`);

  // 6. Análise de hashtags exclusivas (estão no Top 50 mas não no Top 100 geral)
  const allHashtagsSet = new Set(allHashtags);
  const exclusivas = top50Filtered.filter(h => !allHashtagsSet.has(h));

  if (exclusivas.length > 0) {
    console.log('🎯 Hashtags EXCLUSIVAS do Top 50 (não estão no Top 100 geral):');
    exclusivas.forEach((h, idx) => {
      console.log(`   ${String(idx + 1).padStart(2)}. ${h}`);
    });
    console.log(`   Total: ${exclusivas.length} hashtags exclusivas\n`);
  }

  // 7. Inserir Top 50 Filtrado
  console.log('💾 Inserindo Top 50 Filtrado...');

  const top50Record = {
    categoria_geral: 'Dados Reais Instagram - Top 50 Filtrado',
    area_especifica: 'Top 50 hashtags com melhor taxa de qualificação (leads com email/telefone)',
    target_segment: 'leads_qualificados_top_50',
    search_terms: top50Filtered.map(hashtag => ({
      termo: hashtag,
      hashtag: hashtag
    })),
    generated_by_model: 'real_data_top50_filtered',
    generation_prompt: `Top 50 hashtags ranqueadas por taxa de qualificação em 1.489 leads com contato. Incluindo ${exclusivas.length} hashtags exclusivas com 100% de qualificação.`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: error50 } = await supabase
    .from('lead_search_terms')
    .insert([top50Record]);

  if (error50) {
    console.error('❌ Erro:', error50.message);
    return;
  }
  console.log('✅ Top 50 Filtrado inserido!\n');

  // 8. Inserir Top 65 Complementar
  console.log('💾 Inserindo Top 65 Complementar...');

  const top65Record = {
    categoria_geral: 'Dados Reais Instagram - Top 65 Complementar',
    area_especifica: 'Hashtags do Top 100 geral que não entraram no Top 50 Filtrado',
    target_segment: 'leads_gerais_complementar',
    search_terms: top65Complementar.map(hashtag => ({
      termo: hashtag,
      hashtag: hashtag
    })),
    generated_by_model: 'real_data_top65_complementar',
    generation_prompt: `${top65Complementar.length} hashtags complementares do Top 100 geral (base: 2.918 leads totais).`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: error65 } = await supabase
    .from('lead_search_terms')
    .insert([top65Record]);

  if (error65) {
    console.error('❌ Erro:', error65.message);
    return;
  }
  console.log('✅ Top 65 Complementar inserido!\n');

  // 9. Verificação final
  console.log('='  .repeat(80));
  console.log('📊 VERIFICAÇÃO FINAL:\n');

  const { data: check50 } = await supabase
    .from('lead_search_terms')
    .select('search_terms')
    .eq('generated_by_model', 'real_data_top50_filtered')
    .single();

  const { data: check65 } = await supabase
    .from('lead_search_terms')
    .select('search_terms')
    .eq('generated_by_model', 'real_data_top65_complementar')
    .single();

  console.log(`✅ Top 50 Filtrado: ${check50?.search_terms.length || 0} pares`);
  console.log(`✅ Top 65 Complementar: ${check65?.search_terms.length || 0} pares`);
  console.log(`\n📊 Total: ${(check50?.search_terms.length || 0) + (check65?.search_terms.length || 0)} hashtags únicas`);

  console.log('\n' + '='  .repeat(80));
  console.log('🎉 IMPORTAÇÃO CONCLUÍDA!\n');
  console.log('📋 Estrutura final:');
  console.log('   • Top 50 Filtrado: Melhor qualificação (inclui exclusivas)');
  console.log('   • Top 65 Complementar: Restante do Top 100 geral');
  console.log('   • Zero duplicação entre os conjuntos\n');
}

importFinalCorrect().catch(console.error);
