const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyExactLocation() {
  try {
    console.log('🔍 Verificando exatamente onde podem estar os 3 registros...');
    
    // Check different possible locations/tables
    
    // 1. tenant_metrics table
    const { data: tenantMetrics, error: tmError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact' });
    
    console.log(`📊 tenant_metrics: ${tenantMetrics?.length || 0} registros`);
    
    // 2. platform_metrics table  
    const { data: platformMetrics, error: pmError } = await client
      .from('platform_metrics')
      .select('*', { count: 'exact' });
    
    console.log(`📊 platform_metrics: ${platformMetrics?.length || 0} registros`);
    
    // 3. ubs_metric_system table
    const { data: ubsMetrics, error: ubsError } = await client
      .from('ubs_metric_system')
      .select('*', { count: 'exact' });
    
    console.log(`📊 ubs_metric_system: ${ubsMetrics?.length || 0} registros`);
    
    // Check recent platform metrics
    if (platformMetrics && platformMetrics.length > 0) {
      console.log('\n🎯 platform_metrics (últimos registros):');
      platformMetrics.slice(-3).forEach((metric, idx) => {
        console.log(`${idx + 1}. Período: ${metric.period} | MRR: $${metric.platform_mrr} | Tenants: ${metric.active_tenants} | Atualizado: ${new Date(metric.updated_at).toLocaleString()}`);
      });
    }
    
    // Check if you're looking at a specific tenant view
    const { data: specificTenant, error: stError } = await client
      .from('tenant_metrics')
      .select('*')
      .eq('tenant_id', '33b8c488-5aa9-4891-b335-701d10296681'); // Bella Vista
    
    console.log(`\n🏢 Métricas específicas Bella Vista: ${specificTenant?.length || 0} registros`);
    
    // Check the dashboard or frontend data source
    console.log('\n🤔 Possíveis locais onde você vê apenas 3 registros:');
    console.log('1. Dashboard frontend - pode ter filtro aplicado');
    console.log('2. Tabela platform_metrics (tem apenas períodos 7d, 30d, 90d)');
    console.log('3. View específica de um tenant');
    console.log('4. Cache Redis desatualizado');
    console.log('5. Interface administrativa com paginação');
    
    // Test the optimized service stats
    console.log('\n⚡ Testando serviço otimizado...');
    try {
      const { data: serviceTest } = await client.rpc('calculate_tenant_metrics_definitiva_total', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: null
      });
      
      console.log(`Serviço otimizado - Tenants processados: ${serviceTest?.processed_tenants || 'N/A'}`);
    } catch (err) {
      console.log('Serviço otimizado não disponível:', err.message);
    }
    
    console.log('\n📍 Para identificar exatamente onde você está vendo 3 registros:');
    console.log('- Informe qual tela/dashboard/query você está consultando');
    console.log('- Verifique se há filtros de data, tenant ou período aplicados');
    console.log('- Confirme se está olhando tenant_metrics (30 registros) ou platform_metrics (3 registros por período)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyExactLocation();