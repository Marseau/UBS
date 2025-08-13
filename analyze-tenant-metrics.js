const { supabaseAdmin } = require('./src/config/database');

async function analisarTenantMetrics() {
  console.log('🔍 ANALISANDO TENANT_METRICS IMPLEMENTADAS...\n');
  
  // Buscar todos os tipos de métricas implementadas
  const { data: metrics, error } = await supabaseAdmin
    .from('tenant_metrics')
    .select('metric_type, metric_data, period')
    .order('calculated_at', { ascending: false });
    
  if (error) {
    console.log('❌ Erro:', error.message);
    return;
  }
  
  console.log(`📊 Total registros tenant_metrics: ${metrics.length}`);
  
  // Agrupar por tipo de métrica
  const metricsByType = {};
  metrics.forEach(metric => {
    if (!metricsByType[metric.metric_type]) {
      metricsByType[metric.metric_type] = [];
    }
    metricsByType[metric.metric_type].push(metric);
  });
  
  console.log('\n📊 TIPOS DE MÉTRICAS IMPLEMENTADAS:');
  Object.keys(metricsByType).forEach((type, index) => {
    const count = metricsByType[type].length;
    console.log(`   ${index + 1}. ${type}: ${count} registros`);
    
    // Analisar estrutura do metric_data
    if (metricsByType[type][0] && metricsByType[type][0].metric_data) {
      const sampleData = metricsByType[type][0].metric_data;
      const fields = Object.keys(sampleData);
      console.log(`      Campos: ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '...' : ''}`);
    }
    console.log('');
  });
  
  // Analisar campos únicos em metric_data
  const allFields = new Set();
  metrics.forEach(metric => {
    if (metric.metric_data) {
      Object.keys(metric.metric_data).forEach(field => allFields.add(field));
    }
  });
  
  console.log('🎯 TODOS OS CAMPOS ÚNICOS EM METRIC_DATA:');
  Array.from(allFields).sort().forEach((field, index) => {
    console.log(`   ${index + 1}. ${field}`);
  });
  
  console.log('\n💡 RECOMENDAÇÕES PARA PLATFORM_METRICS:');
  console.log('   1. Adicionar campos de agregação por domínio (beauty, healthcare, etc.)');
  console.log('   2. Adicionar métricas de qualidade (WhatsApp, AI)');
  console.log('   3. Adicionar métricas de risco (external_ratio, no_show)');
  console.log('   4. Adicionar métricas de lifetime value e conversão');
  console.log('   5. Adicionar distribuições por status e outcome');
}

analisarTenantMetrics().catch(console.error);