import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface OptimizedHashtag {
  hashtag: string;
  total_frequency: number;
  qualified_frequency: number;
  qualification_rate: number;
  hybrid_score: number;
}

const TOP_50_OPTIMIZED: OptimizedHashtag[] = [
  { hashtag: 'empreendedorismo', total_frequency: 173, qualified_frequency: 90, qualification_rate: 52.02, hybrid_score: 114.9 },
  { hashtag: 'autoconhecimento', total_frequency: 188, qualified_frequency: 81, qualification_rate: 43.09, hybrid_score: 113.1 },
  { hashtag: 'marketingdigital', total_frequency: 139, qualified_frequency: 75, qualification_rate: 53.96, hybrid_score: 94.2 },
  { hashtag: 'autocuidado', total_frequency: 116, qualified_frequency: 61, qualification_rate: 52.59, hybrid_score: 77.5 },
  { hashtag: 'bemestar', total_frequency: 95, qualified_frequency: 46, qualification_rate: 48.42, hybrid_score: 60.7 },
  { hashtag: 'espiritualidade', total_frequency: 98, qualified_frequency: 44, qualification_rate: 44.90, hybrid_score: 60.2 },
  { hashtag: 'tecnologia', total_frequency: 84, qualified_frequency: 44, qualification_rate: 52.38, hybrid_score: 56.0 },
  { hashtag: 'desenvolvimentopessoal', total_frequency: 82, qualified_frequency: 34, qualification_rate: 41.46, hybrid_score: 48.4 },
  { hashtag: 'inovação', total_frequency: 69, qualified_frequency: 38, qualification_rate: 55.07, hybrid_score: 47.3 },
  { hashtag: 'produtividade', total_frequency: 78, qualified_frequency: 32, qualification_rate: 41.03, hybrid_score: 45.8 },
  { hashtag: 'gratidão', total_frequency: 73, qualified_frequency: 34, qualification_rate: 46.58, hybrid_score: 45.7 },
  { hashtag: 'liderança', total_frequency: 68, qualified_frequency: 36, qualification_rate: 52.94, hybrid_score: 45.6 },
  { hashtag: 'saude', total_frequency: 68, qualified_frequency: 36, qualification_rate: 52.94, hybrid_score: 45.6 },
  { hashtag: 'psicologia', total_frequency: 77, qualified_frequency: 30, qualification_rate: 38.96, hybrid_score: 44.1 },
  { hashtag: 'vendas', total_frequency: 59, qualified_frequency: 36, qualification_rate: 61.02, hybrid_score: 42.9 },
  { hashtag: 'amor', total_frequency: 69, qualified_frequency: 30, qualification_rate: 43.48, hybrid_score: 41.7 },
  { hashtag: 'marketing', total_frequency: 55, qualified_frequency: 32, qualification_rate: 58.18, hybrid_score: 38.9 },
  { hashtag: 'sucesso', total_frequency: 54, qualified_frequency: 32, qualification_rate: 59.26, hybrid_score: 38.6 },
  { hashtag: 'negocios', total_frequency: 58, qualified_frequency: 30, qualification_rate: 51.72, hybrid_score: 38.4 },
  { hashtag: 'terapia', total_frequency: 58, qualified_frequency: 30, qualification_rate: 51.72, hybrid_score: 38.4 },
  { hashtag: 'autoestima', total_frequency: 60, qualified_frequency: 27, qualification_rate: 45.00, hybrid_score: 36.9 },
  { hashtag: 'inovacao', total_frequency: 56, qualified_frequency: 26, qualification_rate: 46.43, hybrid_score: 35.0 },
  { hashtag: 'contabilidade', total_frequency: 48, qualified_frequency: 29, qualification_rate: 60.42, hybrid_score: 34.7 },
  { hashtag: 'inteligenciaartificial', total_frequency: 51, qualified_frequency: 25, qualification_rate: 49.02, hybrid_score: 32.8 },
  { hashtag: 'transformacaodigital', total_frequency: 46, qualified_frequency: 26, qualification_rate: 56.52, hybrid_score: 32.0 },
  { hashtag: 'saudemental', total_frequency: 62, qualified_frequency: 18, qualification_rate: 29.03, hybrid_score: 31.2 },
  { hashtag: 'estetica', total_frequency: 41, qualified_frequency: 27, qualification_rate: 65.85, hybrid_score: 31.2 },
  { hashtag: 'negócios', total_frequency: 47, qualified_frequency: 23, qualification_rate: 48.94, hybrid_score: 30.2 },
  { hashtag: 'fé', total_frequency: 54, qualified_frequency: 20, qualification_rate: 37.04, hybrid_score: 30.2 },
  { hashtag: 'transformaçãodigital', total_frequency: 38, qualified_frequency: 26, qualification_rate: 68.42, hybrid_score: 29.6 },
  { hashtag: 'vendasonline', total_frequency: 39, qualified_frequency: 25, qualification_rate: 64.10, hybrid_score: 29.2 },
  { hashtag: 'gestãoempresarial', total_frequency: 41, qualified_frequency: 24, qualification_rate: 58.54, hybrid_score: 29.1 },
  { hashtag: 'gestaoempresarial', total_frequency: 43, qualified_frequency: 23, qualification_rate: 53.49, hybrid_score: 29.0 },
  { hashtag: 'beleza', total_frequency: 36, qualified_frequency: 26, qualification_rate: 72.22, hybrid_score: 29.0 },
  { hashtag: 'mentoria', total_frequency: 39, qualified_frequency: 23, qualification_rate: 58.97, hybrid_score: 27.8 },
  { hashtag: 'transformação', total_frequency: 42, qualified_frequency: 20, qualification_rate: 47.62, hybrid_score: 26.6 },
  { hashtag: 'propósito', total_frequency: 45, qualified_frequency: 18, qualification_rate: 40.00, hybrid_score: 26.1 },
  { hashtag: 'ia', total_frequency: 38, qualified_frequency: 21, qualification_rate: 55.26, hybrid_score: 26.1 },
  { hashtag: 'prosperidade', total_frequency: 37, qualified_frequency: 21, qualification_rate: 56.76, hybrid_score: 25.8 },
  { hashtag: 'carreira', total_frequency: 41, qualified_frequency: 19, qualification_rate: 46.34, hybrid_score: 25.6 },
  { hashtag: 'foco', total_frequency: 42, qualified_frequency: 18, qualification_rate: 42.86, hybrid_score: 25.2 },
  { hashtag: 'aprendizado', total_frequency: 37, qualified_frequency: 20, qualification_rate: 54.05, hybrid_score: 25.1 },
  { hashtag: 'advocacia', total_frequency: 40, qualified_frequency: 18, qualification_rate: 45.00, hybrid_score: 24.6 },
  { hashtag: 'saúdemental', total_frequency: 43, qualified_frequency: 16, qualification_rate: 37.21, hybrid_score: 24.1 },
  { hashtag: 'saúde', total_frequency: 36, qualified_frequency: 19, qualification_rate: 52.78, hybrid_score: 24.1 },
  { hashtag: 'educação', total_frequency: 40, qualified_frequency: 17, qualification_rate: 42.50, hybrid_score: 23.9 },
  { hashtag: 'trafegopago', total_frequency: 35, qualified_frequency: 19, qualification_rate: 54.29, hybrid_score: 23.8 },
  { hashtag: 'emagrecimento', total_frequency: 37, qualified_frequency: 18, qualification_rate: 48.65, hybrid_score: 23.7 },
  { hashtag: 'crescimento', total_frequency: 36, qualified_frequency: 18, qualification_rate: 50.00, hybrid_score: 23.4 },
  { hashtag: 'empresas', total_frequency: 35, qualified_frequency: 18, qualification_rate: 51.43, hybrid_score: 23.1 }
];

async function importTop50Optimized() {
  console.log('🎯 Importando TOP 50 Hashtags OTIMIZADAS para lead_search_terms...\n');
  console.log('📊 Critério: Scoring Híbrido (70% leads qualificados + 30% volume total)\n');
  console.log('='  .repeat(80));

  // Deletar importações anteriores de "real_data_extraction"
  console.log('🗑️  Removendo importação anterior (Top 100)...');
  const { error: deleteError } = await supabase
    .from('lead_search_terms')
    .delete()
    .eq('generated_by_model', 'real_data_extraction');

  if (deleteError) {
    console.error('❌ Erro ao deletar registros anteriores:', deleteError.message);
  } else {
    console.log('✅ Registros anteriores removidos com sucesso\n');
  }

  // Preparar dados para inserção
  const searchTermsData = TOP_50_OPTIMIZED.map((item, index) => ({
    categoria_geral: 'Dados Reais Instagram - TOP 50 OTIMIZADO',
    area_especifica: `Hashtags com melhor taxa de qualificação (scoring híbrido)`,
    target_segment: 'leads_reais_top_50_optimized',
    search_terms: [
      {
        termo: item.hashtag,
        hashtag: item.hashtag
      }
    ],
    generated_by_model: 'real_data_extraction_v2',
    generation_prompt: `Rank #${index + 1} | Score: ${item.hybrid_score.toFixed(1)} | Total: ${item.total_frequency} leads | Qualificados: ${item.qualified_frequency} (${item.qualification_rate.toFixed(1)}%)`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  }));

  console.log('🔄 Inserindo Top 50 otimizado no Supabase...\n');

  // Inserir em lotes de 10
  const batchSize = 10;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < searchTermsData.length; i += batchSize) {
    const batch = searchTermsData.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('lead_search_terms')
      .insert(batch)
      .select();

    if (error) {
      console.error(`❌ Erro no lote ${Math.floor(i / batchSize) + 1}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`✅ Lote ${Math.floor(i / batchSize) + 1}: ${batch.length} hashtags inseridas`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📈 RESUMO DA IMPORTAÇÃO:\n');
  console.log(`   ✅ Inseridas com sucesso: ${inserted}`);
  console.log(`   ❌ Erros: ${errors}`);
  console.log(`   📊 Total processado: ${TOP_50_OPTIMIZED.length}`);

  // Estatísticas dos dados importados
  console.log('\n' + '='.repeat(80));
  console.log('📊 ESTATÍSTICAS DO TOP 50:\n');

  const avgQualificationRate = TOP_50_OPTIMIZED.reduce((sum, h) => sum + h.qualification_rate, 0) / TOP_50_OPTIMIZED.length;
  const totalLeads = TOP_50_OPTIMIZED.reduce((sum, h) => sum + h.total_frequency, 0);
  const totalQualified = TOP_50_OPTIMIZED.reduce((sum, h) => sum + h.qualified_frequency, 0);

  console.log(`   📈 Taxa média de qualificação: ${avgQualificationRate.toFixed(2)}%`);
  console.log(`   📊 Total de menções: ${totalLeads}`);
  console.log(`   ✅ Total de leads qualificados: ${totalQualified}`);
  console.log(`   🏆 Top #1: ${TOP_50_OPTIMIZED[0].hashtag} (score: ${TOP_50_OPTIMIZED[0].hybrid_score.toFixed(1)})`);
  console.log(`   🥈 Top #2: ${TOP_50_OPTIMIZED[1].hashtag} (score: ${TOP_50_OPTIMIZED[1].hybrid_score.toFixed(1)})`);
  console.log(`   🥉 Top #3: ${TOP_50_OPTIMIZED[2].hashtag} (score: ${TOP_50_OPTIMIZED[2].hybrid_score.toFixed(1)})`);

  // Hashtags com melhor taxa de qualificação (>60%)
  const highQualification = TOP_50_OPTIMIZED.filter(h => h.qualification_rate > 60);
  console.log(`\n   🎯 Hashtags premium (>60% qualificação): ${highQualification.length}`);
  highQualification.forEach(h => {
    console.log(`      • ${h.hashtag} - ${h.qualification_rate.toFixed(1)}%`);
  });

  console.log('\n🎉 Importação Top 50 Otimizado concluída!\n');

  // Verificar total na tabela
  const { count } = await supabase
    .from('lead_search_terms')
    .select('*', { count: 'exact', head: true })
    .eq('generated_by_model', 'real_data_extraction_v2');

  console.log(`📊 Total de registros "real_data_extraction_v2" na tabela: ${count}\n`);
}

importTop50Optimized().catch(console.error);
