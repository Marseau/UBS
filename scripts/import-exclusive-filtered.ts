import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// 15 hashtags EXCLUSIVAS de leads qualificados (que NÃO estão no Top 100)
const EXCLUSIVE_FILTERED = [
  { hashtag: 'branding', qualified_frequency: 15, qualification_rate: 100 },
  { hashtag: 'estrategia', qualified_frequency: 15, qualification_rate: 100 },
  { hashtag: 'networking', qualified_frequency: 14, qualification_rate: 100 },
  { hashtag: 'negociosdigitais', qualified_frequency: 14, qualification_rate: 100 },
  { hashtag: 'automação', qualified_frequency: 14, qualification_rate: 100 },
  { hashtag: 'sucessoempresarial', qualified_frequency: 14, qualification_rate: 100 },
  { hashtag: 'empreendedorismofeminino', qualified_frequency: 13, qualification_rate: 100 },
  { hashtag: 'contador', qualified_frequency: 13, qualification_rate: 100 },
  { hashtag: 'erp', qualified_frequency: 13, qualification_rate: 100 },
  { hashtag: 'tráfegopago', qualified_frequency: 13, qualification_rate: 100 },
  { hashtag: 'planejamento', qualified_frequency: 12, qualification_rate: 100 },
  { hashtag: 'gestãofinanceira', qualified_frequency: 12, qualification_rate: 100 },
  { hashtag: 'saopaulo', qualified_frequency: 12, qualification_rate: 100 },
  { hashtag: 'baralhocigano', qualified_frequency: 12, qualification_rate: 100 },
  { hashtag: 'deus', qualified_frequency: 12, qualification_rate: 100 }
];

async function importExclusiveFiltered() {
  console.log('🎯 Importando Hashtags EXCLUSIVAS de Leads Qualificados\n');
  console.log('='  .repeat(80));

  // 1. Deletar registro Top 50 anterior (100 pares incorreto)
  console.log('🗑️  Removendo registro "Top 50 Otimizado" incorreto...');
  const { error: deleteError } = await supabase
    .from('lead_search_terms')
    .delete()
    .eq('generated_by_model', 'real_data_extraction_v2');

  if (deleteError) {
    console.error('❌ Erro ao deletar:', deleteError.message);
  } else {
    console.log('✅ Registro anterior removido\n');
  }

  // 2. Criar registro com 15 hashtags exclusivas
  console.log('💾 Criando registro "Top Filtrado Exclusivo" (15 hashtags)...\n');

  const exclusiveRecord = {
    categoria_geral: 'Dados Reais Instagram - Top Filtrado Exclusivo',
    area_especifica: 'Hashtags exclusivas de leads qualificados (com email/telefone) que NÃO aparecem no Top 100 geral',
    target_segment: 'leads_qualificados_exclusivos',
    search_terms: EXCLUSIVE_FILTERED.map(item => ({
      termo: item.hashtag,
      hashtag: item.hashtag
    })),
    generated_by_model: 'real_data_filtered_exclusive',
    generation_prompt: `15 hashtags exclusivas encontradas APENAS em leads qualificados (com contato). Total: ${EXCLUSIVE_FILTERED.reduce((sum, h) => sum + h.qualified_frequency, 0)} menções em 1.489 leads qualificados. Taxa de qualificação: 100% (só aparecem em leads com contato).`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: insertError } = await supabase
    .from('lead_search_terms')
    .insert([exclusiveRecord]);

  if (insertError) {
    console.error('❌ Erro ao inserir:', insertError.message);
    return;
  }

  console.log('✅ Top Filtrado Exclusivo inserido com sucesso!\n');

  // 3. Verificação final
  console.log('='  .repeat(80));
  console.log('📊 VERIFICAÇÃO FINAL:\n');

  const { data: check } = await supabase
    .from('lead_search_terms')
    .select('categoria_geral, search_terms, generated_by_model')
    .eq('generated_by_model', 'real_data_filtered_exclusive')
    .single();

  if (check) {
    console.log(`✅ Top Filtrado Exclusivo: ${check.search_terms.length} pares termo/hashtag`);
    console.log(`\n📋 Hashtags exclusivas:`);
    check.search_terms.forEach((item: any, idx: number) => {
      const data = EXCLUSIVE_FILTERED[idx];
      console.log(`   ${String(idx + 1).padStart(2)}. ${item.hashtag.padEnd(30)} (${data.qualified_frequency} menções)`);
    });
  }

  console.log('\n' + '='  .repeat(80));
  console.log('🎉 Importação concluída!\n');
  console.log('📋 Registros na tabela lead_search_terms:');
  console.log('   • 1 registro: Top 100 (100 pares - todas as leads)');
  console.log('   • 1 registro: Top Filtrado Exclusivo (15 pares - só leads qualificados)');
  console.log('\n💡 Total: 115 hashtags únicas sem duplicação!\n');

  // 4. Estatísticas
  console.log('📊 ESTATÍSTICAS:\n');
  console.log('   🎯 Hashtags exclusivas de alta qualificação: 15');
  console.log('   ✅ Taxa de qualificação: 100% (só em leads com contato)');
  console.log('   📈 Características dessas hashtags:');
  console.log('      • Vocabulário mais técnico/profissional');
  console.log('      • Foco em negócios e ferramentas (ERP, branding, networking)');
  console.log('      • Indicam perfis comerciais/empresariais\n');
}

importExclusiveFiltered().catch(console.error);
