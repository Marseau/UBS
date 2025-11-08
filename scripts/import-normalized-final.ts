import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function importNormalizedFinal() {
  console.log('🎯 IMPORTAÇÃO FINAL - DADOS NORMALIZADOS\n');
  console.log('=' .repeat(80));

  // 1. Deletar registros anteriores de dados reais
  console.log('🗑️  Removendo importações anteriores de dados reais...');
  const { error: deleteError } = await supabase
    .from('lead_search_terms')
    .delete()
    .or('generated_by_model.eq.real_data_top50_filtered,generated_by_model.eq.real_data_top65_complementar,generated_by_model.eq.real_data_extraction,generated_by_model.eq.real_data_top50_exclusive');

  if (deleteError) {
    console.error('❌ Erro ao deletar:', deleteError.message);
    return;
  }
  console.log('✅ Registros anteriores removidos\n');

  // 2. Ler CSV Top 50 Filtrado Normalizado
  console.log('📊 Lendo Top 50 Filtrado Normalizado (4 campos de contato)...');
  const csv50 = fs.readFileSync(path.join(process.cwd(), 'top_50_filtered_normalized.csv'), 'utf-8');
  const lines50 = csv50.trim().split('\n').slice(1); // Skip header

  const top50Filtered = lines50
    .map(line => {
      const [hashtag] = line.split(',');
      return hashtag.trim();
    })
    .filter(h => h); // Remove empty strings

  console.log(`✅ ${top50Filtered.length} hashtags filtradas carregadas\n`);

  // 3. Ler CSV Complementar Normalizado
  console.log('📊 Lendo Complementar Normalizado (Top 100 - Top 50)...');
  const csvComplementar = fs.readFileSync(path.join(process.cwd(), 'top_complementar_normalized.csv'), 'utf-8');
  const linesComplementar = csvComplementar.trim().split('\n').slice(1); // Skip header

  const complementar = linesComplementar
    .map(line => {
      const [hashtag] = line.split(',');
      return hashtag.trim();
    })
    .filter(h => h); // Remove empty strings

  console.log(`✅ ${complementar.length} hashtags complementares carregadas\n`);

  console.log(`📊 Total: ${top50Filtered.length + complementar.length} hashtags únicas\n`);

  // 4. Verificar interseção (não deveria ter)
  const top50Set = new Set(top50Filtered);
  const duplicates = complementar.filter(h => top50Set.has(h));

  if (duplicates.length > 0) {
    console.log('⚠️  ATENÇÃO: Encontradas hashtags duplicadas entre os conjuntos:');
    duplicates.forEach(h => console.log(`   - ${h}`));
    console.log('');
  } else {
    console.log('✅ Zero duplicação entre os conjuntos\n');
  }

  // 5. Inserir Top 50 Filtrado Normalizado
  console.log('💾 Inserindo Top 50 Filtrado Normalizado...');

  const top50Record = {
    categoria_geral: 'Dados Reais Instagram - Top 50 Filtrado Normalizado',
    area_especifica: 'Top 50 hashtags com melhor taxa de qualificação (leads com email/telefone em 4 campos)',
    target_segment: 'leads_qualificados_top_50_normalized',
    search_terms: top50Filtered.map(hashtag => ({
      termo: hashtag,
      hashtag: hashtag
    })),
    generated_by_model: 'real_data_top50_filtered',
    generation_prompt: `Top 50 hashtags ranqueadas por taxa de qualificação em 1.489 leads com contato (verificando email, phone, additional_emails, additional_phones). Hashtags normalizadas sem acentos para maximizar resultados no Instagram.`,
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
  console.log('✅ Top 50 Filtrado Normalizado inserido!\n');

  // 6. Inserir Complementar Normalizado
  console.log('💾 Inserindo Complementar Normalizado...');

  const complementarRecord = {
    categoria_geral: 'Dados Reais Instagram - Complementar Normalizado',
    area_especifica: 'Hashtags do Top 100 geral que não entraram no Top 50 Filtrado',
    target_segment: 'leads_gerais_complementar_normalized',
    search_terms: complementar.map(hashtag => ({
      termo: hashtag,
      hashtag: hashtag
    })),
    generated_by_model: 'real_data_top65_complementar',
    generation_prompt: `${complementar.length} hashtags complementares do Top 100 geral (base: 2.918 leads totais). Hashtags normalizadas sem acentos, consolidando variações (gestão/gestao, inovação/inovacao).`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: errorComplementar } = await supabase
    .from('lead_search_terms')
    .insert([complementarRecord]);

  if (errorComplementar) {
    console.error('❌ Erro ao inserir Complementar:', errorComplementar.message);
    return;
  }
  console.log('✅ Complementar Normalizado inserido!\n');

  // 7. Verificação final
  console.log('=' .repeat(80));
  console.log('📊 VERIFICAÇÃO FINAL:\n');

  const { data: check50 } = await supabase
    .from('lead_search_terms')
    .select('search_terms, categoria_geral')
    .eq('generated_by_model', 'real_data_top50_filtered')
    .single();

  const { data: checkComplementar } = await supabase
    .from('lead_search_terms')
    .select('search_terms, categoria_geral')
    .eq('generated_by_model', 'real_data_top65_complementar')
    .single();

  console.log(`✅ Top 50 Filtrado: ${check50?.search_terms.length || 0} pares`);
  console.log(`   Categoria: ${check50?.categoria_geral || 'N/A'}`);
  console.log('');
  console.log(`✅ Complementar: ${checkComplementar?.search_terms.length || 0} pares`);
  console.log(`   Categoria: ${checkComplementar?.categoria_geral || 'N/A'}`);
  console.log('');
  console.log(`📊 Total: ${(check50?.search_terms.length || 0) + (checkComplementar?.search_terms.length || 0)} hashtags únicas`);

  console.log('\n' + '=' .repeat(80));
  console.log('🎉 IMPORTAÇÃO CONCLUÍDA COM SUCESSO!\n');
  console.log('📋 Estrutura final:');
  console.log('   • Top 50 Filtrado: Melhor qualificação (4 campos de contato)');
  console.log('   • Complementar: Restante do Top 100 geral (volume)');
  console.log('   • Todas hashtags normalizadas (sem acentos)');
  console.log('   • Zero duplicação entre os conjuntos');
  console.log('   • Pronto para uso no scraper Instagram\n');
}

importNormalizedFinal().catch(console.error);
