const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearAndRepopulate() {
  try {
    console.log('🧹 STEP 1: Clearing tenant_metrics table...');
    
    // Clear all records from tenant_metrics
    const { count: deletedCount, error: deleteError } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('❌ Error clearing table:', deleteError);
      process.exit(1);
    }
    
    console.log(`✅ Cleared ${deletedCount || 0} records from tenant_metrics`);
    
    // Verify table is empty
    const { count: remainingCount, error: countError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Error checking remaining count:', countError);
    } else {
      console.log(`📊 Remaining records: ${remainingCount || 0}`);
    }
    
    if ((remainingCount || 0) > 0) {
      console.warn('⚠️  Table not completely empty, but continuing...');
    }
    
    console.log('\n⚡ STEP 2: Repopulating with DEFINITIVA TOTAL cronjob...');
    
    // Execute DEFINITIVA TOTAL procedure to repopulate
    const { data: cronResult, error: cronError } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: null // All tenants
    });
    
    if (cronError) {
      console.error('❌ Error executing cronjob:', cronError);
      process.exit(1);
    }
    
    console.log('✅ DEFINITIVA TOTAL cronjob executed successfully:');
    console.log(`  - Tenants processados: ${cronResult.processed_tenants}`);
    console.log(`  - Períodos: ${cronResult.periods_processed}`);
    console.log(`  - Total métricas criadas: ${cronResult.total_metrics_created}`);
    console.log(`  - Versão: ${cronResult.version}`);
    console.log(`  - Tempo de execução: ${cronResult.execution_time_ms}ms`);
    
    console.log('\n📊 STEP 3: Verifying final results...');
    
    // Verify final count
    const { count: finalCount, error: finalError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });
    
    if (finalError) {
      console.error('Error getting final count:', finalError);
    } else {
      console.log(`✅ Final count: ${finalCount || 0} records`);
    }
    
    // Get distribution by period
    const { data: distribution, error: distError } = await client
      .from('tenant_metrics')
      .select('period, tenant_id');
    
    if (!distError && distribution) {
      const periodCounts = {};
      const tenantCounts = {};
      
      distribution.forEach(record => {
        periodCounts[record.period] = (periodCounts[record.period] || 0) + 1;
        tenantCounts[record.tenant_id] = (tenantCounts[record.tenant_id] || 0) + 1;
      });
      
      console.log('\n📈 Distribuição por período:');
      Object.keys(periodCounts).forEach(period => {
        console.log(`  ${period}: ${periodCounts[period]} registros`);
      });
      
      console.log(`\n🏢 Tenants únicos: ${Object.keys(tenantCounts).length}`);
      
      const expectedTotal = Object.keys(tenantCounts).length * 3;
      const isCorrect = (finalCount || 0) === expectedTotal;
      
      console.log(`\n${isCorrect ? '✅' : '❌'} Validação:`);
      console.log(`  Esperado: ${Object.keys(tenantCounts).length} tenants × 3 períodos = ${expectedTotal}`);
      console.log(`  Atual: ${finalCount || 0} registros`);
      console.log(`  Status: ${isCorrect ? 'PERFEITO' : 'PRECISA CORREÇÃO'}`);
      
      if (isCorrect) {
        console.log('\n🎉 SISTEMA REPOPULADO COM SUCESSO!');
        console.log('   Todas as métricas foram recriadas corretamente.');
        console.log('   DEFINITIVA TOTAL v4.0 funcionando perfeitamente.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error in clear and repopulate process:', error.message);
    process.exit(1);
  }
}

clearAndRepopulate();