const { supabaseAdmin } = require('./src/config/database');

async function calculatePostTrialRevenue() {
  console.log('💰 CALCULANDO RECEITA DOS TENANTS PÓS-TRIAL...\n');
  
  try {
    // 1. BUSCAR TODOS OS TENANTS E SEUS STATUS
    console.log('🔍 Analisando status dos tenants...');
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name, subscription_plan, status, created_at, trial_end_date')
      .eq('status', 'active');
    
    if (tenantsError) {
      throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
    }
    
    console.log(`📊 ${tenants.length} tenants ativos encontrados\n`);
    
    // 2. VERIFICAR QUAIS PASSARAM DO TRIAL
    const now = new Date();
    const postTrialTenants = [];
    
    console.log('🕐 ANÁLISE DE TRIAL STATUS:');
    tenants.forEach((tenant, index) => {
      console.log(`\n${index + 1}. ${tenant.business_name}`);
      console.log(`   ID: ${tenant.id.substring(0, 8)}...`);
      console.log(`   Plano: ${tenant.subscription_plan}`);
      console.log(`   Criado: ${tenant.created_at}`);
      console.log(`   Trial End: ${tenant.trial_end_date || 'N/A'}`);
      
      // Verificar se passou do trial
      if (tenant.trial_end_date) {
        const trialEnd = new Date(tenant.trial_end_date);
        const passedTrial = now > trialEnd;
        console.log(`   Status Trial: ${passedTrial ? '✅ PASSOU DO TRIAL' : '⏳ EM TRIAL'}`);
        
        if (passedTrial) {
          postTrialTenants.push(tenant);
        }
      } else {
        // Se não tem trial_end_date, assumir que passou (tenant antigo)
        console.log(`   Status Trial: ✅ SEM TRIAL (TENANT ANTIGO)`);
        postTrialTenants.push(tenant);
      }
    });
    
    console.log(`\n📊 TENANTS PÓS-TRIAL: ${postTrialTenants.length}`);
    
    // 3. DEFINIR VALORES DE PLANO
    const planPrices = {
      'basic': 199.00,
      'professional': 499.00,
      'enterprise': 999.00,
      'premium': 799.00, // Se houver
      'free': 0.00
    };
    
    console.log('\n💰 CÁLCULO DE RECEITA PÓS-TRIAL:');
    let totalMRR = 0;
    
    postTrialTenants.forEach((tenant, index) => {
      const planPrice = planPrices[tenant.subscription_plan] || 0;
      totalMRR += planPrice;
      
      console.log(`\n${index + 1}. ${tenant.business_name}`);
      console.log(`   Plano: ${tenant.subscription_plan}`);
      console.log(`   Valor: R$ ${planPrice.toFixed(2)}`);
    });
    
    console.log(`\n🎯 RECEITA REAL DA PLATAFORMA:`);
    console.log(`💰 MRR TOTAL: R$ ${totalMRR.toFixed(2)}`);
    console.log(`📊 TENANTS PAGANTES: ${postTrialTenants.length}`);
    console.log(`💡 ARR PROJETADO: R$ ${(totalMRR * 12).toFixed(2)}`);
    
    // 4. VERIFICAR CONVERSATION BILLING ADICIONAL
    console.log('\n🔍 Verificando conversation billing adicional...');
    const { data: billing, error: billingError } = await supabaseAdmin
      .from('conversation_billing')
      .select('tenant_id, total_amount_brl, billing_period')
      .not('total_amount_brl', 'is', null);
    
    if (!billingError && billing.length > 0) {
      const totalBilling = billing.reduce((sum, b) => sum + (b.total_amount_brl || 0), 0);
      console.log(`💳 CONVERSATION BILLING: R$ ${totalBilling.toFixed(2)}`);
      console.log(`💰 RECEITA TOTAL: R$ ${(totalMRR + totalBilling).toFixed(2)}`);
    } else {
      console.log('📊 Nenhum conversation billing encontrado');
    }
    
    // 5. BREAKDOWN POR PLANO
    console.log('\n📊 BREAKDOWN POR PLANO:');
    const planBreakdown = {};
    postTrialTenants.forEach(tenant => {
      const plan = tenant.subscription_plan;
      if (!planBreakdown[plan]) {
        planBreakdown[plan] = { count: 0, revenue: 0 };
      }
      planBreakdown[plan].count++;
      planBreakdown[plan].revenue += planPrices[plan] || 0;
    });
    
    Object.entries(planBreakdown).forEach(([plan, data]) => {
      console.log(`   ${plan}: ${data.count} tenants → R$ ${data.revenue.toFixed(2)}`);
    });
    
    return {
      total_mrr: totalMRR,
      paying_tenants: postTrialTenants.length,
      plan_breakdown: planBreakdown,
      post_trial_tenants: postTrialTenants.map(t => ({
        id: t.id,
        name: t.business_name,
        plan: t.subscription_plan,
        price: planPrices[t.subscription_plan] || 0
      }))
    };
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  }
}

calculatePostTrialRevenue()
  .then(result => {
    console.log('\n🎉 CÁLCULO CONCLUÍDO!');
    console.log(`✅ MRR Real: R$ ${result.total_mrr.toFixed(2)}`);
    console.log(`✅ Tenants Pagantes: ${result.paying_tenants}`);
  })
  .catch(console.error);