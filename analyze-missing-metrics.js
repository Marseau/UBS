require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function detailedMetricsComparison() {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🔍 ANÁLISE DETALHADA DE MÉTRICAS AUSENTES');
  console.log('='.repeat(70));
  
  try {
    // Pegar todas as métricas únicas de tenant_metrics
    const { data: allTenantMetrics } = await client
      .from('tenant_metrics')
      .select('metric_data');
    
    console.log('\n📊 COLETANDO TODAS AS MÉTRICAS DE TENANT_METRICS...');
    
    const allMetricsSet = new Set();
    
    allTenantMetrics.forEach(record => {
      if (record.metric_data) {
        Object.keys(record.metric_data).forEach(key => {
          allMetricsSet.add(key);
        });
      }
    });
    
    const allTenantMetricsKeys = Array.from(allMetricsSet).sort();
    console.log(`Total de métricas únicas encontradas: ${allTenantMetricsKeys.length}`);
    
    // Pegar métricas implementadas em platform_metrics
    const { data: platformMetrics } = await client
      .from('platform_metrics')
      .select('metric_data, comprehensive_metrics');
    
    const implementedMetrics = new Set();
    
    platformMetrics.forEach(record => {
      if (record.metric_data) {
        Object.keys(record.metric_data).forEach(key => {
          implementedMetrics.add(key);
        });
      }
      if (record.comprehensive_metrics) {
        Object.keys(record.comprehensive_metrics).forEach(key => {
          implementedMetrics.add(key);
        });
      }
    });
    
    console.log('\n📋 TODAS AS MÉTRICAS TENANT_METRICS:');
    allTenantMetricsKeys.forEach((metric, index) => {
      const implemented = implementedMetrics.has(metric) ? '✅' : '❌';
      const num = String(index + 1).padStart(2);
      console.log(`${num}. ${implemented} ${metric}`);
    });
    
    // Identificar métricas ausentes
    const missingMetrics = allTenantMetricsKeys.filter(metric => 
      !implementedMetrics.has(metric)
    );
    
    console.log('\n🚨 MÉTRICAS NÃO IMPLEMENTADAS EM PLATFORM_METRICS:');
    console.log(`Total ausentes: ${missingMetrics.length}`);
    missingMetrics.forEach((metric, index) => {
      const num = String(index + 1).padStart(2);
      console.log(`${num}. ❌ ${metric}`);
    });
    
    // Análise de tipos de dados das métricas ausentes
    console.log('\n📊 ANÁLISE DETALHADA DAS MÉTRICAS AUSENTES:');
    
    const sampleData = {};
    allTenantMetrics.forEach(record => {
      if (record.metric_data) {
        missingMetrics.forEach(metric => {
          if (record.metric_data[metric] !== undefined && !sampleData[metric]) {
            sampleData[metric] = {
              value: record.metric_data[metric],
              type: typeof record.metric_data[metric]
            };
          }
        });
      }
    });
    
    missingMetrics.forEach(metric => {
      const sample = sampleData[metric];
      if (sample) {
        console.log(`  • ${metric}: ${sample.type} (exemplo: ${JSON.stringify(sample.value)})`);
      } else {
        console.log(`  • ${metric}: não encontrado em dados atuais`);
      }
    });
    
    return { allTenantMetricsKeys, implementedMetrics: Array.from(implementedMetrics), missingMetrics, sampleData };
    
  } catch (err) {
    console.log('❌ Erro:', err.message);
    return null;
  }
}

detailedMetricsComparison().then(result => {
  if (result) {
    console.log('\n🎯 RESUMO EXECUTIVO:');
    console.log(`- Total métricas tenant_metrics: ${result.allTenantMetricsKeys.length}`);
    console.log(`- Total métricas implementadas: ${result.implementedMetrics.length}`);
    console.log(`- Total métricas ausentes: ${result.missingMetrics.length}`);
    console.log(`- Completude da agregação: ${Math.round((result.implementedMetrics.length / result.allTenantMetricsKeys.length) * 100)}%`);
  }
});