const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanDebugMetrics() {
  try {
    console.log('Limpando registros de debug/teste antigos...');
    
    // Remove debug_test metrics that are interfering with count
    const { data: debugMetrics, error: findError } = await client
      .from('tenant_metrics')
      .select('*')
      .eq('metric_type', 'debug_test');
    
    if (findError) {
      console.error('Error finding debug metrics:', findError);
      return;
    }
    
    console.log(`Encontrados ${debugMetrics.length} registros debug_test para limpar`);
    
    if (debugMetrics.length > 0) {
      const { error: deleteError } = await client
        .from('tenant_metrics')
        .delete()
        .eq('metric_type', 'debug_test');
      
      if (deleteError) {
        console.error('Error deleting debug metrics:', deleteError);
        return;
      }
      
      console.log('✅ Registros debug_test removidos');
    }
    
    // Verify final count
    const today = new Date().toISOString().split('T')[0];
    const { data: finalCount, error: countError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact' })
      .gte('created_at', today);
    
    if (countError) {
      console.error('Error counting final metrics:', countError);
      return;
    }
    
    console.log(`\n📊 Contagem final: ${finalCount.length} registros`);
    console.log(`✅ Deve ser exatamente 30 registros (10 tenants × 3 períodos)`);
    
    // Verify periods are balanced
    const { data: breakdown, error: breakdownError } = await client
      .from('tenant_metrics')
      .select('period')
      .gte('created_at', today)
      .eq('metric_type', 'comprehensive');
    
    if (!breakdownError) {
      const periodCounts = {};
      breakdown.forEach(metric => {
        periodCounts[metric.period] = (periodCounts[metric.period] || 0) + 1;
      });
      
      console.log('\n📈 Distribuição por período:');
      Object.keys(periodCounts).forEach(period => {
        console.log(`  ${period}: ${periodCounts[period]} registros`);
      });
      
      const allPeriodsEqual = Object.values(periodCounts).every(count => count === 10);
      if (allPeriodsEqual) {
        console.log('✅ Distribuição perfeita: 10 registros por período');
      } else {
        console.log('⚠️ Distribuição desigual detectada');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

cleanDebugMetrics();