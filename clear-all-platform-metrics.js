/**
 * CLEAR ALL PLATFORM METRICS
 * Limpar TODOS os registros da tabela platform_metrics
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function clearAllPlatformMetrics() {
  console.log('🧹 LIMPANDO TODOS OS REGISTROS DA PLATFORM_METRICS');
  console.log('='.repeat(60));

  try {
    // 1. Mostrar registros antes da limpeza
    console.log('\n📊 REGISTROS ANTES DA LIMPEZA:');
    const { data: beforeClean, error: selectError } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('created_at', { ascending: false });

    if (selectError) {
      console.log('❌ Erro ao buscar registros:', selectError);
      return;
    }

    console.log(`✅ Total de registros encontrados: ${beforeClean?.length || 0}`);
    beforeClean?.forEach((record, i) => {
      console.log(`   ${i + 1}. ID: ${record.id} | Data: ${record.calculation_date} | Source: ${record.data_source} | Conversas: ${record.total_conversations}`);
    });

    // 2. Limpar TODOS os registros
    console.log('\n🧹 EXECUTANDO LIMPEZA COMPLETA...');
    const { data: deleted, error: deleteError } = await supabase
      .from('platform_metrics')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (using impossible condition)
      .select();

    if (deleteError) {
      console.log('❌ Erro ao limpar:', deleteError);
      return;
    }

    console.log(`✅ ${deleted?.length || 0} registro(s) excluído(s) com sucesso!`);

    // 3. Verificar se tabela está vazia
    console.log('\n📊 VERIFICANDO RESULTADO FINAL:');
    const { data: afterClean, error: finalError } = await supabase
      .from('platform_metrics')
      .select('*');

    if (finalError) {
      console.log('❌ Erro ao verificar resultado:', finalError);
      return;
    }

    if (!afterClean || afterClean.length === 0) {
      console.log('✅ TABELA PLATFORM_METRICS TOTALMENTE LIMPA!');
      console.log('🎯 Pronta para receber dados frescos do job');
    } else {
      console.log(`⚠️ Ainda restam ${afterClean.length} registros:`);
      afterClean.forEach((record, i) => {
        console.log(`   ${i + 1}. ID: ${record.id} | Data: ${record.calculation_date}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🧹 LIMPEZA COMPLETA CONCLUÍDA');
  console.log('🚀 Agora pode rodar o job para gerar dados frescos!');
}

clearAllPlatformMetrics();