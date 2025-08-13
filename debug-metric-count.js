const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugMetricCount() {
  try {
    console.log('Investigando por que temos 31 registros ao invés de 30...');
    
    // Count total metrics created today
    const today = new Date().toISOString().split('T')[0];
    
    const { data: totalCount, error: countError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact' })
      .gte('created_at', today);
    
    if (countError) {
      console.error('Error counting metrics:', countError);
      return;
    }
    
    console.log(`Total metrics criadas hoje: ${totalCount.length}`);
    
    // Get detailed breakdown by tenant and period
    const { data: breakdown, error: breakdownError } = await client
      .from('tenant_metrics')
      .select('tenant_id, period, metric_type, created_at')
      .gte('created_at', today)
      .order('created_at', { ascending: false });
    
    if (breakdownError) {
      console.error('Error getting breakdown:', breakdownError);
      return;
    }
    
    console.log('\nBreakdown detalhado:');
    
    // Group by tenant_id and period
    const groupedMetrics = {};
    breakdown.forEach(metric => {
      const key = `${metric.tenant_id.substring(0, 8)} - ${metric.period}`;
      if (!groupedMetrics[key]) {
        groupedMetrics[key] = [];
      }
      groupedMetrics[key].push({
        type: metric.metric_type,
        created: new Date(metric.created_at).toLocaleTimeString()
      });
    });
    
    // Display grouped results
    Object.keys(groupedMetrics).forEach(key => {
      console.log(`${key}: ${groupedMetrics[key].length} registros`);
      if (groupedMetrics[key].length > 1) {
        console.log('  -> DUPLICADO!', groupedMetrics[key].map(m => `${m.type} (${m.created})`));
      }
    });
    
    // Count unique tenants
    const uniqueTenants = [...new Set(breakdown.map(m => m.tenant_id))];
    console.log(`\nTenants únicos: ${uniqueTenants.length}`);
    
    // Count by period
    const periodCounts = {};
    breakdown.forEach(metric => {
      periodCounts[metric.period] = (periodCounts[metric.period] || 0) + 1;
    });
    
    console.log('\nContagem por período:');
    Object.keys(periodCounts).forEach(period => {
      console.log(`${period}: ${periodCounts[period]} registros`);
    });
    
    // Expected calculation
    const expected = uniqueTenants.length * 3;
    const actual = breakdown.length;
    
    console.log(`\nAnálise:`);
    console.log(`Tenants: ${uniqueTenants.length} × 3 períodos = ${expected} esperado`);
    console.log(`Atual: ${actual} registros`);
    console.log(`Diferença: +${actual - expected} registro(s)`);
    
    if (actual > expected) {
      console.log('\n🔍 Possíveis causas:');
      console.log('1. Execução dupla da procedure');
      console.log('2. Tenant processado duas vezes');
      console.log('3. Período adicional criado');
      console.log('4. Teste anterior deixou registro extra');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugMetricCount();