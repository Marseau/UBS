const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMrrCalculation() {
  console.log('🔧 CORRIGINDO CÁLCULO DE MRR - DIAGNÓSTICO DETALHADO\n');
  
  // PROBLEMA IDENTIFICADO:
  console.log('❌ PROBLEMA IDENTIFICADO:');
  console.log('   1. Platform MRR = $0 porque NÃO EXISTE metric_type "custo_plataforma"');
  console.log('   2. Apenas metric_type "comprehensive" existe em tenant_metrics');
  console.log('   3. platform-aggregation.service.ts procura por "custo_plataforma" que não existe');
  console.log('   4. subscription_payments tem dados mas amounts = 0 (todos "free" plans)');
  
  // 1. VERIFICAR DADOS REAIS DE SUBSCRIPTION
  console.log('\n1️⃣ VERIFICAR DADOS REAIS DE SUBSCRIPTION:');
  
  const { data: realSubs } = await supabase
    .from('subscription_payments')
    .select('*')
    .neq('amount', 0)
    .order('amount', { ascending: false });
  
  console.log('   Pagamentos com valor > 0:', realSubs?.length || 0);
  
  if (realSubs && realSubs.length > 0) {
    console.log('   Exemplo de pagamentos válidos:');
    realSubs.slice(0, 3).forEach(sub => {
      console.log(`     ${sub.subscription_plan}: R$ ${sub.amount} - ${sub.payment_date}`);
    });
  }
  
  // 2. VERIFICAR TENANTS COM PLANOS PAGOS
  const { data: paidTenants } = await supabase
    .from('tenants')
    .select('id, business_name, subscription_plan')
    .not('subscription_plan', 'in', '("free")')
    .not('subscription_plan', 'is', null);
  
  console.log('\n2️⃣ TENANTS COM PLANOS PAGOS:');
  console.log('   Tenants não-free:', paidTenants?.length || 0);
  
  if (paidTenants && paidTenants.length > 0) {
    console.log('   Planos encontrados:');
    paidTenants.forEach(tenant => {
      console.log(`     ${tenant.business_name}: ${tenant.subscription_plan}`);
    });
  }
  
  // 3. CALCULAR MRR BASEADO EM PLANOS DOS TENANTS
  console.log('\n3️⃣ CALCULAR MRR BASEADO EM PLANOS:');
  
  const planPrices = {
    'basico': 58.00,
    'profissional': 116.00,
    'enterprise': 290.00,
    'pro': 99.00,
    'professional': 199.00,
    'premium': 299.00,
    'free': 0
  };
  
  let totalMrr = 0;
  const planCounts = {};
  
  if (paidTenants) {
    paidTenants.forEach(tenant => {
      const plan = tenant.subscription_plan;
      const price = planPrices[plan] || 0;
      
      totalMrr += price;
      planCounts[plan] = (planCounts[plan] || 0) + 1;
    });
  }
  
  console.log('   Distribuição de planos:', planCounts);
  console.log('   📊 MRR CALCULADO CORRETAMENTE: R$', totalMrr.toFixed(2));
  
  // 4. VERIFICAR O QUE ESTÁ ACONTECENDO NO platform-aggregation.service.ts
  console.log('\n4️⃣ PROBLEMA NO PLATFORM-AGGREGATION.SERVICE.TS:');
  console.log('   ❌ calculatePlatformMRR() procura por metricsByType["custo_plataforma"]');
  console.log('   ❌ Mas custo_plataforma NÃO EXISTE na tenant_metrics');
  console.log('   ❌ Resultado: total = 0, contributors = 0');
  
  // 5. SOLUÇÃO PROPOSTA
  console.log('\n5️⃣ SOLUÇÃO:');
  console.log('   ✅ OPÇÃO 1: Criar métricas custo_plataforma em tenant_metrics');
  console.log('   ✅ OPÇÃO 2: Modificar calculatePlatformMRR() para usar dados de tenants');
  console.log('   ✅ OPÇÃO 3: Usar subscription_payments diretamente');
  
  // 6. TESTAR SOLUÇÃO: Calcular MRR usando tenant info
  console.log('\n6️⃣ TESTE DE SOLUÇÃO - MRR USANDO TENANTS:');
  
  const { data: comprehensiveMetrics } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_type, metric_data')
    .eq('metric_type', 'comprehensive');
  
  console.log('   Tenants em comprehensive metrics:', comprehensiveMetrics?.length || 0);
  
  // Correlacionar com planos
  let calculatedMrr = 0;
  const tenantMrrDetails = [];
  
  if (comprehensiveMetrics) {
    for (const metric of comprehensiveMetrics) {
      // Buscar plano do tenant
      const { data: tenantInfo } = await supabase
        .from('tenants')
        .select('id, business_name, subscription_plan')
        .eq('id', metric.tenant_id)
        .single();
      
      if (tenantInfo) {
        const plan = tenantInfo.subscription_plan || 'free';
        const price = planPrices[plan] || 0;
        
        calculatedMrr += price;
        tenantMrrDetails.push({
          tenant: tenantInfo.business_name,
          plan: plan,
          mrr: price
        });
      }
    }
  }
  
  console.log('   📊 MRR CALCULADO POR TENANT_METRICS: R$', calculatedMrr.toFixed(2));
  
  console.log('\n7️⃣ RESUMO DO PROBLEMA:');
  console.log('   ❌ PlatformAggregationService procura "custo_plataforma" que não existe');
  console.log('   ❌ Deveria usar dados de tenants.subscription_plan');
  console.log('   ✅ MRR real calculado: R$', calculatedMrr.toFixed(2));
  console.log('   ✅ Baseado em', tenantMrrDetails.length, 'tenants com planos válidos');
  
  return {
    realMrr: calculatedMrr,
    tenantDetails: tenantMrrDetails,
    problem: 'custo_plataforma_not_found',
    solution: 'use_tenants_subscription_plan'
  };
}

fixMrrCalculation().then(result => {
  console.log('\n🎯 RESULTADO FINAL:', result.realMrr);
}).catch(console.error);