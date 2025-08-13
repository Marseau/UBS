/**
 * VALIDATE METRIC 1: ACTIVE TENANTS
 * Validar métrica de tenants ativos passo a passo
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function validateActiveTenantsMetric() {
  console.log('🎯 MÉTRICA 1: ACTIVE TENANTS');
  console.log('='.repeat(50));

  try {
    // 1. VALOR ATUAL DO JOB
    console.log('\n📊 1. VALOR ATUAL DO JOB:');
    const { data: currentMetric } = await supabase
      .from('platform_metrics')
      .select('active_tenants')
      .order('created_at', { ascending: false })
      .limit(1);

    const jobValue = currentMetric?.[0]?.active_tenants || 0;
    console.log(`   Job calculou: ${jobValue} tenants ativos`);

    // 2. VALOR CORRETO (FONTE DE VERDADE)
    console.log('\n✅ 2. VALOR CORRETO (FONTE DE VERDADE):');
    const { data: correctTenants, error } = await supabase
      .from('tenants')
      .select('id, business_name, status, subscription_plan')
      .eq('status', 'active');

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    const correctValue = correctTenants?.length || 0;
    console.log(`   Valor correto: ${correctValue} tenants ativos`);

    // 3. COMPARAÇÃO E ANÁLISE
    console.log('\n🔍 3. COMPARAÇÃO:');
    const difference = jobValue - correctValue;
    const isCorrect = difference === 0;

    console.log(`   Job: ${jobValue}`);
    console.log(`   Real: ${correctValue}`);
    console.log(`   Diferença: ${difference > 0 ? '+' : ''}${difference}`);
    console.log(`   Status: ${isCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);

    if (!isCorrect) {
      console.log(`   Erro: ${((difference / correctValue) * 100).toFixed(1)}%`);
    }

    // 4. DETALHES DOS TENANTS ATIVOS
    console.log('\n📋 4. DETALHES DOS TENANTS ATIVOS:');
    correctTenants?.forEach((tenant, i) => {
      console.log(`   ${i + 1}. ${tenant.business_name} (${tenant.subscription_plan})`);
    });

    // 5. INVESTIGAR DE ONDE VEM O VALOR INCORRETO
    if (!isCorrect) {
      console.log('\n🔍 5. INVESTIGANDO FONTE DO ERRO:');
      
      // Verificar o que o job está contando
      const { data: jobSource } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, metric_data')
        .eq('metric_type', 'billing_analysis');

      console.log(`   Job está processando: ${jobSource?.length || 0} registros`);
      
      if (jobSource && jobSource.length > correctValue) {
        console.log('   ❌ PROBLEMA: Job está contando tenants inativos ou duplicados');
        
        // Verificar se há tenants inativos nos dados do job
        const jobTenantIds = jobSource.map(j => j.tenant_id);
        const activeTenantIds = correctTenants.map(t => t.id);
        
        const inactiveInJob = jobTenantIds.filter(id => !activeTenantIds.includes(id));
        
        if (inactiveInJob.length > 0) {
          console.log(`   🚨 Tenants inativos sendo contados: ${inactiveInJob.length}`);
          
          // Buscar detalhes dos tenants inativos
          const { data: inactiveTenants } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .in('id', inactiveInJob);

          console.log('\n   📋 TENANTS INATIVOS NO JOB:');
          inactiveTenants?.forEach((tenant, i) => {
            console.log(`      ${i + 1}. ${tenant.business_name} (${tenant.status})`);
          });
        }
      }
    }

    // 6. SOLUÇÃO PROPOSTA
    console.log('\n🔧 6. SOLUÇÃO PROPOSTA:');
    if (isCorrect) {
      console.log('   ✅ Métrica está correta! Não precisa correção.');
    } else {
      console.log('   ❌ Correção necessária no job:');
      console.log('   1. Filtrar apenas tenants com status = "active"');
      console.log('   2. Evitar duplicatas na contagem');
      console.log('   3. Usar query direta da tabela tenants em vez de tenant_metrics');
      
      console.log('\n   💡 CÓDIGO SUGERIDO:');
      console.log(`   const { data: activeTenants } = await supabase`);
      console.log(`     .from('tenants')`);
      console.log(`     .select('id')`);
      console.log(`     .eq('status', 'active');`);
      console.log(`   `);
      console.log(`   const activeTenantsCount = activeTenants?.length || 0;`);
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎯 VALIDAÇÃO MÉTRICA 1 CONCLUÍDA');
}

validateActiveTenantsMetric();