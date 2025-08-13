const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateTenantMetrics() {
  console.log('🔍 INVESTIGAÇÃO TENANT_METRICS - ESTRUTURA REAL\n');
  
  // 1. Verificar se existem registros tenant_metrics
  const { data: tenantMetrics, error: tmError, count } = await supabase
    .from('tenant_metrics')
    .select('*', { count: 'exact' })
    .limit(3);
  
  console.log('1️⃣ TENANT_METRICS:');
  console.log('   Registros encontrados:', count || 0);
  
  if (tenantMetrics && tenantMetrics.length > 0) {
    console.log('   Estrutura do primeiro registro:');
    const firstRecord = tenantMetrics[0];
    
    Object.keys(firstRecord).forEach(key => {
      if (typeof firstRecord[key] === 'object' && firstRecord[key] !== null) {
        console.log(`   ${key}: ${typeof firstRecord[key]} (OBJETO JSON)`);
        if (key === 'financial_metrics' || key === 'metric_data') {
          const jsonKeys = Object.keys(firstRecord[key]);
          console.log(`     └─ Campos: ${jsonKeys.slice(0, 10).join(', ')}`);
          if (jsonKeys.length > 10) console.log(`       ... e mais ${jsonKeys.length - 10} campos`);
        }
      } else {
        console.log(`   ${key}: ${typeof firstRecord[key]} = ${firstRecord[key]}`);
      }
    });
    
    // 2. Procurar campos relacionados a custo/subscription
    console.log('\n2️⃣ BUSCAR CAMPOS DE CUSTO:');
    const costFields = [];
    
    tenantMetrics.forEach(record => {
      // Verificar metric_data
      if (record.metric_data && typeof record.metric_data === 'object') {
        Object.keys(record.metric_data).forEach(key => {
          if (key.toLowerCase().includes('custo') || 
              key.toLowerCase().includes('cost') ||
              key.toLowerCase().includes('platform') ||
              key.toLowerCase().includes('subscription') ||
              key.toLowerCase().includes('mrr')) {
            if (!costFields.includes(key)) costFields.push(key);
          }
        });
      }
      
      // Verificar financial_metrics
      if (record.financial_metrics && typeof record.financial_metrics === 'object') {
        Object.keys(record.financial_metrics).forEach(key => {
          if (key.toLowerCase().includes('custo') || 
              key.toLowerCase().includes('cost') ||
              key.toLowerCase().includes('platform') ||
              key.toLowerCase().includes('subscription') ||
              key.toLowerCase().includes('mrr')) {
            if (!costFields.includes('financial_metrics.' + key)) costFields.push('financial_metrics.' + key);
          }
        });
      }
    });
    
    console.log('   Campos encontrados:', costFields);
    
    // 3. Verificar metric_types únicos
    const { data: metricTypes } = await supabase
      .from('tenant_metrics')
      .select('metric_type')
      .not('metric_type', 'is', null);
    
    const uniqueTypes = [...new Set(metricTypes?.map(m => m.metric_type) || [])];
    console.log('\n3️⃣ METRIC_TYPES ÚNICOS:', uniqueTypes);
    
    // 4. Verificar especificamente custo_plataforma
    const { data: custoData, count: custoCount } = await supabase
      .from('tenant_metrics')
      .select('*', { count: 'exact' })
      .eq('metric_type', 'custo_plataforma')
      .limit(2);
    
    console.log('\n4️⃣ METRIC_TYPE = custo_plataforma:');
    console.log('   Registros:', custoCount || 0);
    
    if (custoData && custoData.length > 0) {
      console.log('   Exemplo metric_data:');
      const custoMetricData = custoData[0].metric_data;
      if (custoMetricData && typeof custoMetricData === 'object') {
        Object.keys(custoMetricData).forEach(key => {
          console.log(`     ${key}: ${custoMetricData[key]}`);
        });
      }
    } else {
      console.log('   ❌ NENHUM REGISTRO custo_plataforma ENCONTRADO!');
      console.log('   ⚠️  Este pode ser o problema - sem dados custo_plataforma');
    }
    
    // 5. Verificar se existem campos subscription em outros metric_types
    console.log('\n5️⃣ VERIFICAR SUBSCRIPTION EM OUTROS TIPOS:');
    
    const { data: allMetrics } = await supabase
      .from('tenant_metrics')
      .select('metric_type, metric_data')
      .limit(50);
    
    const subscriptionFields = new Set();
    
    allMetrics?.forEach(record => {
      if (record.metric_data && typeof record.metric_data === 'object') {
        Object.keys(record.metric_data).forEach(key => {
          if (key.toLowerCase().includes('subscription') || 
              key.toLowerCase().includes('plan') ||
              key.toLowerCase().includes('monthly') ||
              key.toLowerCase().includes('fee')) {
            subscriptionFields.add(`${record.metric_type}.${key}`);
          }
        });
      }
    });
    
    console.log('   Campos subscription encontrados:', Array.from(subscriptionFields));
    
  } else {
    console.log('   ❌ NENHUM REGISTRO tenant_metrics ENCONTRADO!');
  }
  
  // 6. Verificar platform_metrics para comparação
  const { data: platformMetrics, count: pmCount } = await supabase
    .from('platform_metrics')
    .select('*', { count: 'exact' })
    .limit(1);
  
  console.log('\n6️⃣ PLATFORM_METRICS (para comparação):');
  console.log('   Registros:', pmCount || 0);
  
  if (platformMetrics && platformMetrics.length > 0) {
    const pmRecord = platformMetrics[0];
    console.log('   Campos disponíveis:', Object.keys(pmRecord));
    
    // Verificar comprehensive_metrics
    if (pmRecord.comprehensive_metrics) {
      console.log('   comprehensive_metrics campos:', Object.keys(pmRecord.comprehensive_metrics));
      if (pmRecord.comprehensive_metrics.platform_mrr !== undefined) {
        console.log('   📊 platform_mrr atual:', pmRecord.comprehensive_metrics.platform_mrr);
      }
      if (pmRecord.comprehensive_metrics.platform_mrr_total !== undefined) {
        console.log('   📊 platform_mrr_total atual:', pmRecord.comprehensive_metrics.platform_mrr_total);
      }
    }
  }
  
  // 7. Verificar tabela de subscription_payments
  console.log('\n7️⃣ VERIFICAR SUBSCRIPTION_PAYMENTS:');
  const { data: subPayments, count: subCount } = await supabase
    .from('subscription_payments')
    .select('*', { count: 'exact' })
    .limit(3);
  
  console.log('   Registros:', subCount || 0);
  
  if (subPayments && subPayments.length > 0) {
    console.log('   Estrutura:', Object.keys(subPayments[0]));
    console.log('   Exemplo:', {
      tenant_id: subPayments[0].tenant_id,
      amount: subPayments[0].amount,
      subscription_plan: subPayments[0].subscription_plan,
      payment_date: subPayments[0].payment_date
    });
  }
  
  // 8. Verificar tenants table para subscription info
  console.log('\n8️⃣ VERIFICAR TENANTS SUBSCRIPTION_PLAN:');
  const { data: tenants, count: tenantsCount } = await supabase
    .from('tenants')
    .select('id, business_name, subscription_plan', { count: 'exact' })
    .not('subscription_plan', 'is', null)
    .limit(5);
  
  console.log('   Tenants com subscription_plan:', tenantsCount || 0);
  if (tenants && tenants.length > 0) {
    tenants.forEach(t => {
      console.log(`   ${t.business_name}: ${t.subscription_plan}`);
    });
  }
}

investigateTenantMetrics().catch(console.error);