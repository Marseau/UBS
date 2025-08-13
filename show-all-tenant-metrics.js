const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showAllTenantMetrics() {
  try {
    console.log('📊 Mostrando TODAS as métricas de tenants...\n');
    
    // Get all tenant metrics without filters
    const { data: allMetrics, error } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, created_at')
      .order('tenant_id', { ascending: true })
      .order('period', { ascending: true });
    
    if (error) {
      console.error('Error fetching metrics:', error);
      return;
    }
    
    console.log(`Total de registros: ${allMetrics.length}`);
    
    // Group by tenant
    const groupedByTenant = {};
    allMetrics.forEach(metric => {
      const tenantKey = metric.tenant_id;
      if (!groupedByTenant[tenantKey]) {
        groupedByTenant[tenantKey] = [];
      }
      groupedByTenant[tenantKey].push(metric);
    });
    
    console.log(`Tenants únicos: ${Object.keys(groupedByTenant).length}\n`);
    
    // Show breakdown by tenant
    Object.keys(groupedByTenant).forEach((tenantId, index) => {
      const metrics = groupedByTenant[tenantId];
      const periods = metrics.map(m => m.period).sort();
      
      console.log(`${index + 1}. Tenant: ${tenantId.substring(0, 8)}...`);
      console.log(`   Períodos: ${periods.join(', ')} (${periods.length} registros)`);
      
      if (periods.length !== 3) {
        console.log('   ⚠️  ATENÇÃO: Deveria ter 3 períodos (7d, 30d, 90d)');
      }
    });
    
    // Show period distribution
    const periodCounts = {};
    allMetrics.forEach(metric => {
      periodCounts[metric.period] = (periodCounts[metric.period] || 0) + 1;
    });
    
    console.log('\n📈 Distribuição por período:');
    Object.keys(periodCounts).forEach(period => {
      console.log(`  ${period}: ${periodCounts[period]} registros`);
    });
    
    // Validation
    const expectedTotal = Object.keys(groupedByTenant).length * 3;
    console.log(`\n✅ Validação:`);
    console.log(`  Esperado: ${Object.keys(groupedByTenant).length} tenants × 3 períodos = ${expectedTotal}`);
    console.log(`  Atual: ${allMetrics.length} registros`);
    console.log(`  Status: ${allMetrics.length === expectedTotal ? '✅ CORRETO' : '❌ INCORRETO'}`);
    
    if (allMetrics.length === expectedTotal) {
      console.log('\n🎯 DEFINITIVA TOTAL funcionando PERFEITAMENTE!');
      console.log('   O filtro no Supabase Dashboard estava mostrando apenas 1 tenant.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

showAllTenantMetrics();