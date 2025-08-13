/**
 * INVESTIGATE 33 TENANTS IMPOSSIBLE
 * Como pode haver 33 tenants se só existem 10?
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function investigate33TenantsImpossible() {
  console.log('🚨 INVESTIGANDO: COMO HÁ 33 TENANTS SE SÓ EXISTEM 10?');
  console.log('='.repeat(60));

  try {
    // 1. TOTAL DE TENANTS REAIS NO SISTEMA
    console.log('\n📊 1. TOTAL DE TENANTS REAIS:');
    const { data: allTenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, business_name, status');

    if (tenantError) {
      console.log('❌ Erro:', tenantError);
      return;
    }

    console.log(`✅ Total de tenants no sistema: ${allTenants?.length || 0}`);
    console.log('\n📋 TODOS OS TENANTS:');
    allTenants?.forEach((tenant, i) => {
      console.log(`   ${i + 1}. ${tenant.business_name} (${tenant.status}) - ${tenant.id}`);
    });

    // 2. REGISTROS NA TENANT_METRICS
    console.log('\n📊 2. REGISTROS NA TENANT_METRICS:');
    const { data: tenantMetrics, error: metricsError } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data')
      .eq('metric_type', 'billing_analysis');

    if (metricsError) {
      console.log('❌ Erro:', metricsError);
      return;
    }

    console.log(`❌ Total de registros na tenant_metrics: ${tenantMetrics?.length || 0}`);

    // 3. ANÁLISE DE DUPLICATAS
    console.log('\n🔍 3. VERIFICANDO DUPLICATAS:');
    const tenantIdCounts = {};
    tenantMetrics?.forEach(record => {
      const id = record.tenant_id;
      tenantIdCounts[id] = (tenantIdCounts[id] || 0) + 1;
    });

    const duplicates = Object.entries(tenantIdCounts).filter(([id, count]) => count > 1);
    
    if (duplicates.length > 0) {
      console.log(`🚨 DUPLICATAS ENCONTRADAS: ${duplicates.length} tenants duplicados`);
      duplicates.forEach(([tenantId, count]) => {
        const tenant = allTenants?.find(t => t.id === tenantId);
        console.log(`   ${tenant?.business_name || 'Unknown'}: ${count} registros (${tenantId})`);
      });
    } else {
      console.log('✅ Nenhuma duplicata encontrada');
    }

    // 4. TENANTS FANTASMA
    console.log('\n👻 4. VERIFICANDO TENANTS FANTASMA:');
    const allTenantIds = allTenants?.map(t => t.id) || [];
    const metricsTenantIds = tenantMetrics?.map(m => m.tenant_id) || [];
    
    const ghostTenants = metricsTenantIds.filter(id => !allTenantIds.includes(id));
    
    if (ghostTenants.length > 0) {
      console.log(`👻 TENANTS FANTASMA ENCONTRADOS: ${ghostTenants.length}`);
      
      // Agrupar fantasmas (podem ser duplicados)
      const ghostCounts = {};
      ghostTenants.forEach(id => {
        ghostCounts[id] = (ghostCounts[id] || 0) + 1;
      });

      Object.entries(ghostCounts).forEach(([ghostId, count]) => {
        console.log(`   ${ghostId}: ${count} registros (NÃO EXISTE na tabela tenants)`);
      });
    } else {
      console.log('✅ Nenhum tenant fantasma encontrado');
    }

    // 5. RESUMO MATEMÁTICO
    console.log('\n🧮 5. RESUMO MATEMÁTICO:');
    const uniqueTenantsInMetrics = new Set(metricsTenantIds).size;
    const totalRecords = tenantMetrics?.length || 0;
    const totalDuplicates = totalRecords - uniqueTenantsInMetrics;

    console.log(`   📊 Total de registros na tenant_metrics: ${totalRecords}`);
    console.log(`   🎯 Tenants únicos na tenant_metrics: ${uniqueTenantsInMetrics}`);
    console.log(`   📈 Total de tenants reais no sistema: ${allTenants?.length || 0}`);
    console.log(`   🔄 Registros duplicados: ${totalDuplicates}`);
    console.log(`   👻 Tenants fantasma: ${ghostTenants.length}`);

    // 6. EXPLICAÇÃO DO PROBLEMA
    console.log('\n💡 6. EXPLICAÇÃO DO PROBLEMA:');
    if (totalRecords > (allTenants?.length || 0)) {
      console.log('🚨 PROBLEMA CONFIRMADO:');
      console.log(`   O job processou ${totalRecords} registros`);
      console.log(`   Mas só existem ${allTenants?.length || 0} tenants no sistema`);
      console.log(`   Diferença: ${totalRecords - (allTenants?.length || 0)} registros extras`);
      
      if (duplicates.length > 0) {
        console.log(`   🔄 Causa: ${duplicates.length} tenants têm registros duplicados`);
      }
      if (ghostTenants.length > 0) {
        console.log(`   👻 Causa: ${ghostTenants.length} registros de tenants que não existem`);
      }
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🚨 INVESTIGAÇÃO CONCLUÍDA');
}

investigate33TenantsImpossible();