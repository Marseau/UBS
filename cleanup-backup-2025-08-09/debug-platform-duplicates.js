/**
 * DEBUG PLATFORM METRICS DUPLICATES
 * Investigar por que há 2 registros quando deveria sobrescrever
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function debugDuplicates() {
  console.log('🔍 INVESTIGANDO DUPLICATAS NA PLATFORM_METRICS');
  console.log('='.repeat(60));

  try {
    // 1. Buscar TODOS os registros com detalhes completos
    console.log('\n📊 1. TODOS OS REGISTROS DA PLATFORM_METRICS:');
    const { data: allMetrics, error } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    console.log(`✅ Total de registros: ${allMetrics?.length || 0}`);
    
    allMetrics?.forEach((metric, i) => {
      console.log(`\n📅 Registro ${i + 1}:`);
      console.log(`   ID: ${metric.id}`);
      console.log(`   Data Cálculo: ${metric.calculation_date}`);
      console.log(`   Created At: ${metric.created_at}`);
      console.log(`   Updated At: ${metric.updated_at}`);
      console.log(`   Período: ${metric.period_days} dias`);
      console.log(`   Data Source: ${metric.data_source}`);
      console.log(`   Tenants: ${metric.active_tenants}`);
      console.log(`   Conversas: ${metric.total_conversations}`);
      console.log(`   Appointments: ${metric.total_appointments}`);
      console.log(`   MRR: R$ ${metric.platform_mrr}`);
      console.log(`   AI Interactions: ${metric.total_ai_interactions}`);
    });

    // 2. Verificar se há registros com mesma data e período
    console.log('\n🔍 2. ANÁLISE DE DUPLICATAS:');
    const groupedByDate = {};
    allMetrics?.forEach(metric => {
      const key = `${metric.calculation_date}_${metric.period_days}`;
      if (!groupedByDate[key]) {
        groupedByDate[key] = [];
      }
      groupedByDate[key].push(metric);
    });

    Object.entries(groupedByDate).forEach(([key, records]) => {
      if (records.length > 1) {
        console.log(`\n🚨 DUPLICATA ENCONTRADA: ${key}`);
        console.log(`   ${records.length} registros para mesma data/período:`);
        records.forEach((record, i) => {
          console.log(`   ${i + 1}. ID: ${record.id} | Created: ${record.created_at} | Conversas: ${record.total_conversations}`);
        });
      } else {
        console.log(`\n✅ Único: ${key} - ${records[0].id}`);
      }
    });

    // 3. Verificar a lógica de upsert no código
    console.log('\n🔍 3. VERIFICANDO CONSTRAINT UNIQUE:');
    const { data: constraints, error: constraintError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            conname as constraint_name,
            pg_get_constraintdef(c.oid) as constraint_definition
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace  
          JOIN pg_class cl ON cl.oid = c.conrelid
          WHERE cl.relname = 'platform_metrics'
          AND c.contype = 'u';
        `
      });

    if (constraintError) {
      console.log('❌ Erro ao verificar constraints:', constraintError);
    } else {
      console.log('✅ Constraints UNIQUE encontrados:');
      constraints?.forEach(constraint => {
        console.log(`   ${constraint.constraint_name}: ${constraint.constraint_definition}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 INVESTIGAÇÃO CONCLUÍDA');
}

debugDuplicates();