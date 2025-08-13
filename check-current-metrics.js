const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCurrentMetrics() {
  try {
    console.log('Verificando status atual das métricas...');
    
    // Check total count without date filter
    const { data: allMetrics, error: allError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact' });
    
    if (allError) {
      console.error('Error counting all metrics:', allError);
      return;
    }
    
    console.log(`Total de registros na tabela: ${allMetrics.length}`);
    
    // Check today's metrics
    const today = new Date().toISOString().split('T')[0];
    const { data: todayMetrics, error: todayError } = await client
      .from('tenant_metrics')
      .select('*')
      .gte('created_at', today)
      .order('created_at', { ascending: false });
    
    if (todayError) {
      console.error('Error getting today metrics:', todayError);
      return;
    }
    
    console.log(`Registros criados hoje (${today}): ${todayMetrics.length}`);
    
    // Check comprehensive metrics specifically
    const { data: comprehensiveMetrics, error: compError } = await client
      .from('tenant_metrics')
      .select('*')
      .eq('metric_type', 'comprehensive')
      .gte('created_at', today);
    
    if (compError) {
      console.error('Error getting comprehensive metrics:', compError);
      return;
    }
    
    console.log(`Registros 'comprehensive' hoje: ${comprehensiveMetrics.length}`);
    
    // Show recent metrics details
    if (todayMetrics.length > 0) {
      console.log('\n📋 Últimos registros criados:');
      todayMetrics.slice(0, 5).forEach((metric, idx) => {
        console.log(`${idx + 1}. Tenant: ${metric.tenant_id.substring(0, 8)} | Período: ${metric.period} | Tipo: ${metric.metric_type} | Criado: ${new Date(metric.created_at).toLocaleString()}`);
      });
    }
    
    // Check if there are any very recent DEFINITIVA TOTAL executions
    const { data: recentExecution, error: execError } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null
    });
    
    if (execError) {
      console.log('\n⚠️ Erro ao executar DEFINITIVA TOTAL:', execError.message);
    } else {
      console.log('\n✅ DEFINITIVA TOTAL executada com sucesso:');
      console.log(`  - Tenants processados: ${recentExecution.processed_tenants}`);
      console.log(`  - Períodos: ${recentExecution.periods_processed}`);
      console.log(`  - Métricas criadas: ${recentExecution.total_metrics_created}`);
      console.log(`  - Versão: ${recentExecution.version}`);
    }
    
    // Final count after execution
    const { data: finalMetrics, error: finalError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact' })
      .gte('created_at', today);
    
    if (!finalError) {
      console.log(`\n📊 Contagem final após execução: ${finalMetrics.length} registros`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCurrentMetrics();