const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Script para validar a implementação das métricas
async function validateMetricsImplementation() {
  console.log('🔍 VALIDANDO IMPLEMENTAÇÃO DAS MÉTRICAS');
  console.log('=' .repeat(50));
  
  const validationResults = {
    metrics_validated: 0,
    successful_validations: 0,
    failed_validations: 0,
    data_quality_issues: [],
    recommendations: []
  };
  
  try {
    // === TESTE 1: VERIFICAR SE TODAS AS MÉTRICAS FORAM CRIADAS ===
    console.log('\n📊 1. VERIFICANDO MÉTRICAS CRIADAS...');
    
    const expectedMetrics = [
      'revenue_per_customer',
      'conversion_rate',
      'no_show_rate', 
      'customer_lifetime_value',
      'trial_conversion_rate',
      'external_appointment_ratio',
      'whatsapp_quality_score',
      'ai_quality_score'
    ];
    
    for (const metricType of expectedMetrics) {
      const { data: metrics, error } = await supabase
        .from('tenant_metrics')
        .select('id, tenant_id, metric_data')
        .eq('metric_type', metricType);
      
      if (error) {
        console.log(`   ❌ Erro ao verificar ${metricType}: ${error.message}`);
        validationResults.failed_validations++;
      } else {
        console.log(`   ✅ ${metricType}: ${metrics.length} registros encontrados`);
        validationResults.successful_validations++;
        
        // Verificar qualidade dos dados
        if (metrics.length === 0) {
          validationResults.data_quality_issues.push(`${metricType}: Nenhum registro encontrado`);
        }
      }
      validationResults.metrics_validated++;
    }
    
    // === TESTE 2: VALIDAR CONSISTÊNCIA DOS DADOS ===
    console.log('\n🔍 2. VALIDANDO CONSISTÊNCIA DOS DADOS...');
    
    await validateRevenuePerCustomer();
    await validateConversionRate();
    await validateNoShowRate();
    await validateCLV();
    await validateExternalRatio();
    await validateWhatsAppQuality();
    await validateAIQuality();
    
    // === TESTE 3: VERIFICAR INTEGRIDADE CROSS-TENANT ===
    console.log('\n🏢 3. VERIFICANDO INTEGRIDADE CROSS-TENANT...');
    
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active');
    
    const { data: metricsCount } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_type')
      .in('metric_type', expectedMetrics);
    
    // Verificar se todos os tenants têm todas as métricas
    const metricsPerTenant = {};
    metricsCount.forEach(metric => {
      if (!metricsPerTenant[metric.tenant_id]) {
        metricsPerTenant[metric.tenant_id] = new Set();
      }
      metricsPerTenant[metric.tenant_id].add(metric.metric_type);
    });
    
    tenants.forEach(tenant => {
      const tenantMetrics = metricsPerTenant[tenant.id] || new Set();
      const missingMetrics = expectedMetrics.filter(m => !tenantMetrics.has(m));
      
      if (missingMetrics.length > 0) {
        console.log(`   ⚠️ ${tenant.business_name}: ${missingMetrics.length} métricas faltantes`);
        validationResults.data_quality_issues.push(
          `${tenant.business_name}: Métricas faltantes - ${missingMetrics.join(', ')}`
        );
      } else {
        console.log(`   ✅ ${tenant.business_name}: Todas as métricas presentes`);
      }
    });
    
    // === TESTE 4: BENCHMARK E COMPARAÇÕES ===
    console.log('\n📈 4. ANÁLISE DE BENCHMARKS...');
    await performBenchmarkAnalysis();
    
    // === TESTE 5: DETECÇÃO DE ANOMALIAS ===
    console.log('\n🚨 5. DETECÇÃO DE ANOMALIAS...');
    await detectAnomalies();
    
    console.log('\n' + '=' .repeat(50));
    console.log('📊 RESUMO DA VALIDAÇÃO:');
    console.log(`✅ ${validationResults.successful_validations} validações bem-sucedidas`);
    console.log(`❌ ${validationResults.failed_validations} validações falharam`);
    console.log(`⚠️ ${validationResults.data_quality_issues.length} problemas de qualidade identificados`);
    
    if (validationResults.data_quality_issues.length > 0) {
      console.log('\n🔧 PROBLEMAS IDENTIFICADOS:');
      validationResults.data_quality_issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
    }
    
    return validationResults;
    
  } catch (error) {
    console.error('❌ Erro na validação:', error);
    throw error;
  }
}

// Funções de validação específicas
async function validateRevenuePerCustomer() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'revenue_per_customer');
  
  let validCount = 0;
  let totalRevenue = 0;
  
  metrics.forEach(metric => {
    const data = metric.metric_data;
    const rpc = data.revenue_per_customer;
    
    if (rpc > 0 && rpc < 10000) { // Valores razoáveis
      validCount++;
      totalRevenue += data.total_revenue;
    }
  });
  
  const avgRPC = metrics.length > 0 ? 
    metrics.reduce((sum, m) => sum + m.metric_data.revenue_per_customer, 0) / metrics.length : 0;
  
  console.log(`   💰 Receita por Cliente: ${validCount}/${metrics.length} válidos, média R$ ${avgRPC.toFixed(2)}`);
  console.log(`   💵 Receita total agregada: R$ ${totalRevenue.toFixed(2)}`);
}

async function validateConversionRate() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'conversion_rate');
  
  let validCount = 0;
  let totalConversions = 0;
  let totalConversations = 0;
  
  metrics.forEach(metric => {
    const data = metric.metric_data;
    const rate = data.operational_efficiency_pct;
    
    if (rate >= 0 && rate <= 100) {
      validCount++;
      totalConversions += data.converted_conversations;
      totalConversations += data.total_conversations;
    }
  });
  
  const overallRate = totalConversations > 0 ? (totalConversions / totalConversations) * 100 : 0;
  const avgRate = metrics.length > 0 ? 
    metrics.reduce((sum, m) => sum + m.metric_data.operational_efficiency_pct, 0) / metrics.length : 0;
  
  console.log(`   🎯 Taxa de Conversão: ${validCount}/${metrics.length} válidos, média ${avgRate.toFixed(2)}%`);
  console.log(`   📊 ${totalConversions}/${totalConversations} conversões totais`);
}

async function validateNoShowRate() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'no_show_rate');
  
  let validCount = 0;
  let totalNoShows = 0;
  let totalAppointments = 0;
  
  metrics.forEach(metric => {
    const data = metric.metric_data;
    const rate = data.no_show_rate_pct;
    
    if (rate >= 0 && rate <= 100) {
      validCount++;
      totalNoShows += data.no_shows;
      totalAppointments += data.total_appointments;
    }
  });
  
  const overallRate = totalAppointments > 0 ? (totalNoShows / totalAppointments) * 100 : 0;
  const avgRate = metrics.length > 0 ? 
    metrics.reduce((sum, m) => sum + m.metric_data.no_show_rate_pct, 0) / metrics.length : 0;
  
  console.log(`   📅 Taxa de No-Show: ${validCount}/${metrics.length} válidos, média ${avgRate.toFixed(2)}%`);
  console.log(`   📊 ${totalNoShows}/${totalAppointments} no-shows totais (${overallRate.toFixed(2)}%)`);
}

async function validateCLV() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'customer_lifetime_value');
  
  let validCount = 0;
  let totalCLV = 0;
  
  metrics.forEach(metric => {
    const data = metric.metric_data;
    const clv = data.avg_clv;
    
    if (clv > 0 && clv < 50000) { // Valores razoáveis
      validCount++;
      totalCLV += clv;
    }
  });
  
  const avgCLV = validCount > 0 ? totalCLV / validCount : 0;
  
  console.log(`   💎 Customer Lifetime Value: ${validCount}/${metrics.length} válidos, média R$ ${avgCLV.toFixed(2)}`);
}

async function validateExternalRatio() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'external_appointment_ratio');
  
  let highRisk = 0;
  let mediumRisk = 0;
  let lowRisk = 0;
  
  metrics.forEach(metric => {
    const data = metric.metric_data;
    const risk = data.risk_level;
    
    if (risk === 'high') highRisk++;
    else if (risk === 'medium') mediumRisk++;
    else lowRisk++;
  });
  
  const avgExternal = metrics.length > 0 ? 
    metrics.reduce((sum, m) => sum + m.metric_data.external_ratio_pct, 0) / metrics.length : 0;
  
  console.log(`   📱 External Ratio: média ${avgExternal.toFixed(2)}% externos`);
  console.log(`   🚨 Riscos: ${highRisk} alto, ${mediumRisk} médio, ${lowRisk} baixo`);
}

async function validateWhatsAppQuality() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'whatsapp_quality_score');
  
  let excellent = 0;
  let good = 0;
  let regular = 0;
  let poor = 0;
  
  metrics.forEach(metric => {
    const data = metric.metric_data;
    const level = data.quality_level;
    
    if (level === 'excellent') excellent++;
    else if (level === 'good') good++;
    else if (level === 'regular') regular++;
    else poor++;
  });
  
  const avgQuality = metrics.length > 0 ? 
    metrics.reduce((sum, m) => sum + m.metric_data.quality_score_pct, 0) / metrics.length : 0;
  
  console.log(`   📞 WhatsApp Quality: média ${avgQuality.toFixed(2)}% qualidade`);
  console.log(`   📊 Níveis: ${excellent} excelente, ${good} boa, ${regular} regular, ${poor} ruim`);
}

async function validateAIQuality() {
  const { data: metrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'ai_quality_score');
  
  if (metrics && metrics.length > 0) {
    const avgConfidence = metrics.reduce((sum, m) => sum + m.metric_data.avg_confidence_score, 0) / metrics.length;
    const avgQuality = metrics.reduce((sum, m) => sum + m.metric_data.ai_quality_pct, 0) / metrics.length;
    
    console.log(`   🤖 AI Quality: ${avgConfidence.toFixed(4)} confidence média, ${avgQuality.toFixed(2)}% qualidade`);
  } else {
    console.log(`   ⚠️ AI Quality: Nenhuma métrica encontrada`);
  }
}

async function performBenchmarkAnalysis() {
  // Análise comparativa entre domínios
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, domain, business_name')
    .eq('status', 'active');
  
  const domains = {};
  tenants.forEach(tenant => {
    if (!domains[tenant.domain]) {
      domains[tenant.domain] = [];
    }
    domains[tenant.domain].push(tenant);
  });
  
  for (const [domain, domainTenants] of Object.entries(domains)) {
    const tenantIds = domainTenants.map(t => t.id);
    
    // Análise de receita por domínio
    const { data: revenueMetrics } = await supabase
      .from('tenant_metrics')
      .select('metric_data')
      .eq('metric_type', 'revenue_per_customer')
      .in('tenant_id', tenantIds);
    
    if (revenueMetrics && revenueMetrics.length > 0) {
      const avgRevenue = revenueMetrics.reduce((sum, m) => sum + m.metric_data.revenue_per_customer, 0) / revenueMetrics.length;
      console.log(`   📊 ${domain}: R$ ${avgRevenue.toFixed(2)} receita/cliente média`);
    }
  }
}

async function detectAnomalies() {
  // Detectar valores atípicos
  const anomalies = [];
  
  // CLV muito alto ou muito baixo
  const { data: clvMetrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'customer_lifetime_value');
  
  if (clvMetrics && clvMetrics.length > 0) {
    const clvValues = clvMetrics.map(m => m.metric_data.avg_clv);
    const avgCLV = clvValues.reduce((sum, val) => sum + val, 0) / clvValues.length;
    const stdDev = Math.sqrt(clvValues.reduce((sum, val) => sum + Math.pow(val - avgCLV, 2), 0) / clvValues.length);
    
    clvMetrics.forEach(metric => {
      const clv = metric.metric_data.avg_clv;
      if (Math.abs(clv - avgCLV) > 2 * stdDev) {
        anomalies.push(`CLV anômalo: R$ ${clv.toFixed(2)} (tenant ${metric.tenant_id})`);
      }
    });
  }
  
  // Taxa de no-show muito alta
  const { data: noShowMetrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'no_show_rate');
  
  noShowMetrics.forEach(metric => {
    const rate = metric.metric_data.no_show_rate_pct;
    if (rate > 30) {
      anomalies.push(`No-show rate alta: ${rate.toFixed(2)}% (tenant ${metric.tenant_id})`);
    }
  });
  
  if (anomalies.length > 0) {
    console.log(`   🚨 ${anomalies.length} anomalias detectadas:`);
    anomalies.forEach((anomaly, index) => {
      console.log(`      ${index + 1}. ${anomaly}`);
    });
  } else {
    console.log(`   ✅ Nenhuma anomalia significativa detectada`);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  validateMetricsImplementation()
    .then(results => {
      console.log('\n✅ VALIDAÇÃO CONCLUÍDA!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 FALHA NA VALIDAÇÃO:', error);
      process.exit(1);
    });
}

module.exports = { validateMetricsImplementation };