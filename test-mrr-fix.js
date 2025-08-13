const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Import the compiled service
const { platformAggregationService } = require('./dist/services/platform-aggregation.service.js');

async function testMrrFix() {
  console.log('🧪 TESTE DO FIX DE MRR - Platform Aggregation Service\n');
  
  try {
    // Testar para período de 30d
    console.log('📊 Executando aggregatePlatformMetricsFromTenants para 30d...\n');
    
    const result = await platformAggregationService.aggregatePlatformMetricsFromTenants('30d');
    
    console.log('\n✅ RESULTADO DO TESTE:');
    
    // Verificar comprehensive_metrics
    const comprehensive = result.comprehensive_metrics;
    if (comprehensive) {
      console.log('📈 COMPREHENSIVE METRICS:');
      console.log(`   💰 Platform MRR: R$ ${comprehensive.platform_mrr || 0}`);
      console.log(`   💰 Platform MRR Total: R$ ${comprehensive.platform_mrr_total || 0}`);
      console.log(`   💵 Total Revenue: R$ ${comprehensive.total_revenue || 0}`);
      console.log(`   🏢 Active Tenants: ${comprehensive.active_tenants || 0}`);
      console.log(`   📅 Total Appointments: ${comprehensive.total_appointments || 0}`);
    }
    
    // Verificar se MRR é > 0 agora
    const mrrValue = comprehensive?.platform_mrr || comprehensive?.platform_mrr_total || 0;
    
    console.log('\n🎯 RESULTADO DO FIX:');
    if (mrrValue > 0) {
      console.log(`✅ SUCESSO! Platform MRR agora é R$ ${mrrValue} (antes era $0)`);
      console.log('✅ Fix funcionou - MRR está sendo calculado corretamente usando tenants.subscription_plan');
    } else {
      console.log('❌ PROBLEMA PERSISTE: MRR ainda é $0');
      console.log('   Verificar se existem tenants com subscription_plan não-free');
    }
    
    // Salvar o resultado para verificar persistence
    console.log('\n💾 Salvando métricas corrigidas...');
    await platformAggregationService.savePlatformAggregatedMetrics(result, '30d');
    
    console.log('✅ Métricas salvas! Verificar dashboard agora...');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error);
    console.error('Stack:', error.stack);
  }
}

testMrrFix();