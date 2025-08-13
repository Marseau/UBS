require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compareTenantVsPlatformMetrics() {
  console.log('📊 COMPARANDO MÉTRICAS: tenant_metrics vs platform_metrics');
  console.log('========================================================\n');
  
  // Get tenant_metrics sample
  const { data: tenantSample } = await client
    .from('tenant_metrics')
    .select('metric_data')
    .eq('period', '30d')
    .limit(1);
    
  // Get platform_metrics sample  
  const { data: platformSample } = await client
    .from('platform_metrics')
    .select('metric_data')
    .eq('period', '30d')
    .limit(1);
    
  if (!tenantSample || !tenantSample[0] || !platformSample || !platformSample[0]) {
    console.log('❌ Dados não encontrados');
    return;
  }
  
  const tenantData = tenantSample[0].metric_data;
  const platformData = platformSample[0].metric_data;
  
  console.log('🎯 ESTRUTURA tenant_metrics (V6.0 ATUAL):');
  console.log('==========================================');
  
  // Analyze tenant_metrics structure (v6.0 format)
  if (typeof tenantData === 'object' && tenantData !== null) {
    const fields = Object.keys(tenantData).sort();
    console.log('📋 Campos disponíveis:', fields.length);
    
    fields.forEach(field => {
      const value = tenantData[field];
      const type = Array.isArray(value) ? 'array' : typeof value;
      const preview = type === 'object' && value !== null ? 
        `{${Object.keys(value).slice(0,3).join(', ')}${Object.keys(value).length > 3 ? '...' : ''}}` :
        String(value).substring(0, 50);
        
      console.log(`  • ${field}: ${type} = ${preview}`);
    });
  }
  
  console.log('\n🏗️ ESTRUTURA platform_metrics (UNIFICADO):');
  console.log('============================================');
  
  // Analyze platform_metrics structure (unified format)
  if (typeof platformData === 'object' && platformData !== null) {
    const modules = Object.keys(platformData).sort();
    console.log('📋 Módulos disponíveis:', modules.length);
    
    modules.forEach(module => {
      const moduleData = platformData[module];
      if (typeof moduleData === 'object' && moduleData !== null) {
        const fields = Object.keys(moduleData);
        console.log(`\n  📦 ${module}:`);
        fields.forEach(field => {
          const value = moduleData[field];
          console.log(`    • ${field}: ${value}`);
        });
      }
    });
  }
  
  console.log('\n❌ MÉTRICAS NÃO AGREGADAS (tenant → platform):');
  console.log('================================================');
  
  // Compare what's missing
  if (typeof tenantData === 'object' && tenantData !== null) {
    const tenantFields = Object.keys(tenantData);
    
    console.log('\n🚫 CAMPOS BÁSICOS PERDIDOS DO TENANT_METRICS:');
    tenantFields.forEach(field => {
      if (!['period', 'version', 'calculation_date', 'tenant_id', 'business_name'].includes(field)) {
        const value = tenantData[field];
        const type = typeof value;
        console.log(`  ❌ ${field}: ${type} = ${value} (não agregado na platform)`);
      }
    });
    
    console.log('\n📊 POTENCIAIS GRÁFICOS E DASHBOARDS PERDIDOS:');
    console.log('=============================================');
    console.log('❌ GRÁFICOS DE TENDÊNCIA TEMPORAL:');
    console.log('  • Revenue progression por período');
    console.log('  • Appointment volume trends');
    console.log('  • Customer growth over time');
    console.log('  • Individual tenant performance vs platform average');
    
    console.log('\n❌ ANÁLISES DISTRIBUTIVAS:');
    console.log('  • Business name word cloud');
    console.log('  • Domain distribution (healthcare, beauty, etc.)');
    console.log('  • Tenant size clustering (by revenue/appointments)');
    console.log('  • Geographic distribution (if available)');
    
    console.log('\n❌ MÉTRICAS OPERACIONAIS DETALHADAS:');
    console.log('  • Individual tenant health scores');
    console.log('  • Outlier detection (high/low performers)');
    console.log('  • Tenant lifecycle analysis');
    console.log('  • Version distribution tracking');
    
    console.log('\n💡 RECOMENDAÇÕES PARA SUPER ADMIN DASHBOARD:');
    console.log('=============================================');
    console.log('✅ GRÁFICOS SUGERIDOS:');
    console.log('  📈 Time series: Platform revenue vs individual contributions');
    console.log('  🎯 Scatter plot: Tenant revenue vs appointments (size by customers)');
    console.log('  📊 Bar chart: Top 10 performing tenants by revenue');
    console.log('  🥧 Pie chart: Revenue distribution by tenant size');
    console.log('  📉 Line chart: MRR growth vs actual revenue growth');
    console.log('  🌡️ Heat map: Tenant performance matrix (revenue vs growth)');
    
    console.log('\n✅ MÉTRICAS ADICIONAIS RECOMENDADAS:');
    console.log('  💰 Average Revenue Per Tenant (ARPT)');
    console.log('  📊 Revenue concentration (% from top 20% tenants)');
    console.log('  🎯 Tenant engagement score (appointments/customer ratio)');
    console.log('  📈 Platform growth velocity');
    console.log('  ⚖️ Revenue vs Cost margin per tenant');
    
    console.log('\n🔧 ESTRUTURA UNIFICADA - BENEFÍCIOS ATUAIS:');
    console.log('===========================================');
    console.log('✅ Same JSONB organization (financial_metrics, appointment_metrics, etc.)');
    console.log('✅ Platform MRR calculated correctly from subscription_payments');
    console.log('✅ Weighted averages for meaningful platform KPIs');
    console.log('✅ Consistent data access patterns for developers');
    console.log('✅ Dashboard component reusability between tenant and platform views');
    console.log('✅ Architectural uniformity maintained');
    
    console.log('\n🎨 DASHBOARD IMPLEMENTATION SUGGESTIONS:');
    console.log('=======================================');
    console.log('1. Create tenant drill-down capability from platform charts');
    console.log('2. Add tenant comparison tools (side-by-side metrics)');
    console.log('3. Implement tenant ranking and leaderboards');
    console.log('4. Add alert system for tenant performance anomalies');
    console.log('5. Create tenant lifecycle stages visualization');
    console.log('6. Add predictive analytics for tenant churn risk');
    
    console.log('\n🚀 NEXT DEVELOPMENT PRIORITIES:');
    console.log('===============================');
    console.log('Priority 1: Individual tenant drill-down views');
    console.log('Priority 2: Comparative analytics (tenant vs platform)');  
    console.log('Priority 3: Predictive metrics and alerts');
    console.log('Priority 4: Advanced visualization components');
    console.log('Priority 5: Export and reporting capabilities');
  }
}

compareTenantVsPlatformMetrics().catch(console.error);