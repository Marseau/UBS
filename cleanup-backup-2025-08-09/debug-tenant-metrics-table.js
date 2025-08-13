/**
 * DEBUG TENANT METRICS TABLE
 * Verificar estrutura e dados da tabela tenant_metrics
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function debugTenantMetricsTable() {
  console.log('🔍 DEBUGANDO TABELA TENANT_METRICS');
  console.log('='.repeat(50));

  try {
    // 1. Verificar estrutura da tabela
    console.log('\n📊 1. ESTRUTURA DA TABELA:');
    const { data: columns, error: structError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = 'tenant_metrics'
          ORDER BY ordinal_position;
        `
      });

    if (structError) {
      console.log('❌ Erro ao verificar estrutura:', structError);
    } else {
      console.log('✅ Colunas da tabela tenant_metrics:');
      columns?.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
      });
    }

    // 2. Verificar total de registros
    console.log('\n📊 2. TOTAL DE REGISTROS:');
    const { data: countData, error: countError } = await supabase
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.log('❌ Erro ao contar registros:', countError);
    } else {
      console.log(`✅ Total de registros: ${countData?.length || 0}`);
    }

    // 3. Verificar alguns registros
    console.log('\n📊 3. REGISTROS DE EXEMPLO:');
    const { data: sampleData, error: sampleError } = await supabase
      .from('tenant_metrics')
      .select('*')
      .limit(5);

    if (sampleError) {
      console.log('❌ Erro ao buscar registros:', sampleError);
    } else {
      console.log(`✅ Encontrados ${sampleData?.length || 0} registros de exemplo:`);
      sampleData?.forEach((record, i) => {
        console.log(`\n📅 Registro ${i + 1}:`);
        Object.entries(record).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      });
    }

    // 4. Verificar registros com metric_type = 'billing_analysis'
    console.log('\n📊 4. REGISTROS COM METRIC_TYPE = billing_analysis:');
    const { data: billingData, error: billingError } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data')
      .eq('metric_type', 'billing_analysis');

    if (billingError) {
      console.log('❌ Erro ao buscar billing_analysis:', billingError);
    } else {
      console.log(`✅ Encontrados ${billingData?.length || 0} registros billing_analysis`);
      billingData?.slice(0, 3).forEach((record, i) => {
        console.log(`\n📊 Billing Record ${i + 1}:`);
        console.log(`   Tenant ID: ${record.tenant_id}`);
        console.log(`   Metric Data:`, JSON.stringify(record.metric_data, null, 2));
      });
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🔍 DEBUG TENANT_METRICS CONCLUÍDO');
}

debugTenantMetricsTable();