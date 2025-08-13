const { TenantMetricsCronOptimizedService } = require('./dist/services/tenant-metrics-cron-optimized.service.js');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testCompleteMetricsImplementation() {
  console.log('🚀 TESTANDO IMPLEMENTAÇÃO COMPLETA DE MÉTRICAS');
  console.log('='.repeat(70));
  
  try {
    // 1. Limpar dados antigos
    console.log('\n🧹 LIMPANDO DADOS ANTIGOS...');
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    await client.from('platform_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('✅ Platform metrics limpos');
    
    // 2. Executar agregação completa
    console.log('\n🔧 EXECUTANDO AGREGAÇÃO COMPLETA...');
    const service = new TenantMetricsCronOptimizedService();
    await service.initialize();
    
    const startTime = Date.now();
    await service.triggerPlatformAggregation();
    const duration = Date.now() - startTime;
    
    console.log(`✅ Agregação completa em ${duration}ms`);
    
    // 3. Validar resultados
    console.log('\n📊 VALIDANDO RESULTADOS...');
    
    const { data: results, error } = await client
      .from('platform_metrics')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.log('❌ Erro na consulta:', error);
      return;
    }
    
    console.log(`📈 Total registros criados: ${results.length}`);
    
    // 4. Análise detalhada de cada período
    for (const record of results) {
      console.log(`\n📋 PERÍODO: ${record.period}`);
      console.log(`   Data: ${record.calculation_date}`);
      
      const metrics = record.comprehensive_metrics;
      const metricData = record.metric_data;
      
      console.log('\n   🎯 MÉTRICAS PRINCIPAIS:');
      console.log(`     • Active Tenants: ${metrics.active_tenants}`);
      console.log(`     • Total Revenue: R$ ${metrics.total_revenue?.toLocaleString()}`);
      console.log(`     • Total Appointments: ${metrics.total_appointments}`);
      console.log(`     • Total Customers: ${metrics.total_customers}`);
      console.log(`     • Platform MRR: R$ ${metrics.platform_mrr?.toLocaleString()}`);
      
      console.log('\n   📅 NOVAS MÉTRICAS - AGENDAMENTOS:');
      console.log(`     • Confirmed: ${metrics.total_confirmed_appointments || 0}`);
      console.log(`     • Cancelled: ${metrics.total_cancelled_appointments || 0}`);
      console.log(`     • Pending: ${metrics.total_pending_appointments || 0}`);
      console.log(`     • Completed: ${metrics.total_completed_appointments || 0}`);
      
      console.log('\n   👥 NOVAS MÉTRICAS - CLIENTES:');
      console.log(`     • New Customers: ${metrics.total_new_customers || 0}`);
      console.log(`     • Returning Customers: ${metrics.total_returning_customers || 0}`);
      console.log(`     • Retention Rate: ${metrics.customer_retention_rate_pct?.toFixed(1)}%`);
      
      console.log('\n   📊 NOVAS MÉTRICAS - PERFORMANCE:');
      console.log(`     • Business Health Score: ${metrics.average_business_health_score?.toFixed(1)}`);
      console.log(`     • Risk Score: ${metrics.average_risk_score?.toFixed(1)}`);
      console.log(`     • Success Rate: ${metrics.appointment_success_rate_pct?.toFixed(1)}%`);
      console.log(`     • Cancellation Rate: ${metrics.appointment_cancellation_rate_pct?.toFixed(1)}%`);
      console.log(`     • Completion Rate: ${metrics.appointment_completion_rate_pct?.toFixed(1)}%`);
      
      console.log('\n   📈 NOVAS MÉTRICAS - CRESCIMENTO:');
      console.log(`     • Growth Rate: ${metrics.average_appointments_growth_rate?.toFixed(1)}%`);
      console.log(`     • Monthly Revenue: R$ ${metrics.total_monthly_revenue?.toLocaleString()}`);
      
      console.log('\n   🌐 NOVAS MÉTRICAS - PARTICIPAÇÃO:');
      console.log(`     • Appointments %: ${metrics.avg_appointments_platform_percentage?.toFixed(2)}%`);
      console.log(`     • Customers %: ${metrics.avg_customers_platform_percentage?.toFixed(2)}%`);
      console.log(`     • Revenue %: ${metrics.avg_revenue_platform_percentage?.toFixed(2)}%`);
      
      // Verificar métricas no metric_data
      if (metricData.risk_levels_distribution) {
        console.log('\n   ⚠️  DISTRIBUIÇÃO DE RISCO:');
        Object.entries(metricData.risk_levels_distribution).forEach(([level, count]) => {
          console.log(`     • ${level}: ${count} tenants`);
        });
      }
      
      console.log('\n   📅 METADATA:');
      console.log(`     • Period Start: ${metricData.period_start}`);
      console.log(`     • Period End: ${metricData.period_end}`);
      console.log(`     • Tenants Processed: ${metricData.tenants_processed}`);
      console.log(`     • Data Source: ${metricData.data_source}`);
    }
    
    // 5. Comparar com análise original
    console.log('\n🔍 COMPARAÇÃO COM ANÁLISE ORIGINAL:');
    
    // Reexecutar análise de métricas ausentes
    const { data: allTenantMetrics } = await client
      .from('tenant_metrics')
      .select('metric_data');
    
    const allMetricsSet = new Set();
    allTenantMetrics.forEach(record => {
      if (record.metric_data) {
        Object.keys(record.metric_data).forEach(key => {
          allMetricsSet.add(key);
        });
      }
    });
    
    const allTenantMetricsKeys = Array.from(allMetricsSet);
    
    // Verificar quantas métricas agora estão implementadas
    const implementedInPlatform = new Set();
    results.forEach(record => {
      if (record.metric_data) {
        Object.keys(record.metric_data).forEach(key => {
          implementedInPlatform.add(key);
        });
      }
      if (record.comprehensive_metrics) {
        Object.keys(record.comprehensive_metrics).forEach(key => {
          implementedInPlatform.add(key);
        });
      }
    });
    
    const stillMissing = allTenantMetricsKeys.filter(metric => 
      !implementedInPlatform.has(metric)
    );
    
    console.log(`\n📊 RESULTADOS FINAIS:`);
    console.log(`   • Total métricas tenant_metrics: ${allTenantMetricsKeys.length}`);
    console.log(`   • Métricas implementadas: ${implementedInPlatform.size}`);
    console.log(`   • Métricas ainda ausentes: ${stillMissing.length}`);
    console.log(`   • Completude da agregação: ${Math.round((implementedInPlatform.size / allTenantMetricsKeys.length) * 100)}%`);
    
    if (stillMissing.length > 0) {
      console.log(`\n❌ Métricas ainda ausentes:`);
      stillMissing.forEach((metric, index) => {
        console.log(`   ${index + 1}. ${metric}`);
      });
    } else {
      console.log(`\n✅ TODAS AS MÉTRICAS IMPLEMENTADAS COM SUCESSO!`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    process.exit(1);
  }
}

testCompleteMetricsImplementation();