/**
 * DELETE INCORRECT PLATFORM METRICS RECORD
 * Excluir o registro incorreto com data_source = 'platform_subscription_plans'
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function deleteIncorrectRecord() {
  console.log('🗑️ EXCLUINDO REGISTRO INCORRETO');
  console.log('='.repeat(50));

  try {
    // 1. Mostrar o registro que será excluído
    console.log('\n📊 REGISTRO A SER EXCLUÍDO:');
    const { data: toDelete, error: selectError } = await supabase
      .from('platform_metrics')
      .select('*')
      .eq('data_source', 'platform_subscription_plans')
      .eq('calculation_date', '2025-07-31')
      .eq('period_days', 30);

    if (selectError) {
      console.log('❌ Erro ao buscar registro:', selectError);
      return;
    }

    if (!toDelete || toDelete.length === 0) {
      console.log('❌ Nenhum registro encontrado para excluir');
      return;
    }

    console.log(`✅ Encontrado ${toDelete.length} registro(s) para excluir:`);
    toDelete.forEach(record => {
      console.log(`   ID: ${record.id}`);
      console.log(`   Data Source: ${record.data_source}`);
      console.log(`   Conversas: ${record.total_conversations}`);
      console.log(`   MRR: R$ ${record.platform_mrr}`);
      console.log(`   Created: ${record.created_at}`);
    });

    // 2. Excluir o registro incorreto
    console.log('\n🗑️ EXECUTANDO EXCLUSÃO...');
    const { data: deleted, error: deleteError } = await supabase
      .from('platform_metrics')
      .delete()
      .eq('data_source', 'platform_subscription_plans')
      .eq('calculation_date', '2025-07-31')
      .eq('period_days', 30)
      .select();

    if (deleteError) {
      console.log('❌ Erro ao excluir:', deleteError);
      return;
    }

    console.log(`✅ ${deleted?.length || 0} registro(s) excluído(s) com sucesso!`);

    // 3. Verificar resultado final
    console.log('\n📊 VERIFICANDO RESULTADO FINAL:');
    const { data: remaining, error: finalError } = await supabase
      .from('platform_metrics')
      .select('*')
      .eq('calculation_date', '2025-07-31')
      .eq('period_days', 30);

    if (finalError) {
      console.log('❌ Erro ao verificar resultado:', finalError);
      return;
    }

    console.log(`✅ Registros restantes: ${remaining?.length || 0}`);
    remaining?.forEach((record, i) => {
      console.log(`\n📅 Registro ${i + 1} (MANTIDO):`);
      console.log(`   ID: ${record.id}`);
      console.log(`   Data Source: ${record.data_source}`);
      console.log(`   Conversas: ${record.total_conversations}`);
      console.log(`   Appointments: ${record.total_appointments}`);
      console.log(`   MRR: R$ ${record.platform_mrr}`);
      console.log(`   AI Interactions: ${record.total_ai_interactions}`);
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🗑️ LIMPEZA CONCLUÍDA');
}

deleteIncorrectRecord();