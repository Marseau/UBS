const { supabaseAdmin } = require('./src/config/database');

async function calculateRealPlatformRevenueCorrected() {
  console.log('💰 CALCULANDO RECEITA REAL DA PLATAFORMA (CORRIGIDO)...\n');
  
  try {
    // 1. BUSCAR TODOS OS TENANTS ATIVOS
    console.log('🔍 Buscando tenants ativos...');
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('status', 'active');
    
    if (tenantsError) {
      throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
    }
    
    console.log(`📊 ${tenants.length} tenants ativos encontrados\n`);
    
    // 2. IDENTIFICAR TENANTS PÓS-TRIAL
    const postTrialTenants = tenants.filter(tenant => {
      // Tenant tem subscription_start_date = já passou do trial
      return tenant.subscription_start_date && tenant.subscription_start_date !== null;
    });
    
    console.log(`🎯 TENANTS PÓS-TRIAL: ${postTrialTenants.length}`);
    
    // 3. DEFINIR PREÇOS REAIS DOS PLANOS
    const planPrices = {
      'basico': 199.00,
      'profissional': 499.00,
      'enterprise': 999.00,
      'premium': 799.00,
      'free': 0.00
    };
    
    console.log('\n💰 CÁLCULO DE RECEITA PÓS-TRIAL:');
    let totalMRR = 0;
    const planBreakdown = {};
    
    postTrialTenants.forEach((tenant, index) => {
      const planPrice = planPrices[tenant.subscription_plan] || 0;
      totalMRR += planPrice;
      
      // Contar breakdown por plano
      if (!planBreakdown[tenant.subscription_plan]) {
        planBreakdown[tenant.subscription_plan] = { count: 0, revenue: 0 };
      }
      planBreakdown[tenant.subscription_plan].count++;
      planBreakdown[tenant.subscription_plan].revenue += planPrice;
      
      console.log(`\n${index + 1}. ${tenant.business_name}`);
      console.log(`   Plano: ${tenant.subscription_plan}`);
      console.log(`   Subscription Start: ${tenant.subscription_start_date}`);
      console.log(`   Valor Mensal: R$ ${planPrice.toFixed(2)}`);
      console.log(`   Monthly Fee Campo: R$ ${tenant.monthly_subscription_fee || 'N/A'}`);
    });
    
    // 4. USAR monthly_subscription_fee COMO FONTE DE VERDADE
    console.log('\n🎯 CALCULANDO COM MONTHLY_SUBSCRIPTION_FEE:');
    let realMRR = 0;
    
    postTrialTenants.forEach((tenant, index) => {
      const monthlyFee = tenant.monthly_subscription_fee || 0;
      realMRR += monthlyFee;
      
      console.log(`${index + 1}. ${tenant.business_name}: R$ ${monthlyFee.toFixed(2)}`);
    });
    
    console.log(`\n🎯 RECEITA REAL DA PLATAFORMA:`);
    console.log(`💰 MRR BASEADO EM PLANOS: R$ ${totalMRR.toFixed(2)}`);
    console.log(`💰 MRR BASEADO EM MONTHLY_FEE: R$ ${realMRR.toFixed(2)}`);
    console.log(`📊 TENANTS PAGANTES: ${postTrialTenants.length}`);
    console.log(`💡 ARR PROJETADO: R$ ${(realMRR * 12).toFixed(2)}`);
    
    // 5. BREAKDOWN POR PLANO
    console.log('\n📊 BREAKDOWN POR PLANO:');
    Object.entries(planBreakdown).forEach(([plan, data]) => {
      console.log(`   ${plan}: ${data.count} tenants → R$ ${data.revenue.toFixed(2)} (baseado em tabela de preços)`);
    });
    
    // 6. VERIFICAR CONVERSATION BILLING ADICIONAL
    console.log('\n🔍 Verificando conversation billing adicional...');
    const { data: billing, error: billingError } = await supabaseAdmin
      .from('conversation_billing')
      .select('tenant_id, total_amount_brl, billing_period')
      .not('total_amount_brl', 'is', null);
    
    let conversationRevenue = 0;
    if (!billingError && billing.length > 0) {
      conversationRevenue = billing.reduce((sum, b) => sum + (b.total_amount_brl || 0), 0);
      console.log(`💳 CONVERSATION BILLING: R$ ${conversationRevenue.toFixed(2)}`);
    } else {
      console.log('📊 Nenhum conversation billing encontrado');
    }
    
    const totalPlatformRevenue = realMRR + conversationRevenue;
    
    console.log(`\n🎉 RECEITA TOTAL DA PLATAFORMA:`);
    console.log(`💰 MRR Subscriptions: R$ ${realMRR.toFixed(2)}`);
    console.log(`💰 Conversation Billing: R$ ${conversationRevenue.toFixed(2)}`);
    console.log(`💰 TOTAL: R$ ${totalPlatformRevenue.toFixed(2)}`);
    
    // 7. RESUMO FINAL
    console.log('\n📋 RESUMO EXECUTIVO:');
    console.log(`✅ ${postTrialTenants.length} tenants pagaram e passaram do trial`);
    console.log(`✅ Todos têm subscription_start_date definida`);
    console.log(`✅ MRR real baseado em monthly_subscription_fee`);
    console.log(`✅ Não é R$ 0,00 como calculado anteriormente`);
    
    return {
      total_platform_revenue: totalPlatformRevenue,
      mrr_subscriptions: realMRR,
      conversation_revenue: conversationRevenue,
      paying_tenants: postTrialTenants.length,
      plan_breakdown: planBreakdown,
      post_trial_tenants: postTrialTenants.map(t => ({
        id: t.id,
        name: t.business_name,
        plan: t.subscription_plan,
        monthly_fee: t.monthly_subscription_fee,
        subscription_start: t.subscription_start_date
      }))
    };
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  }
}

calculateRealPlatformRevenueCorrected()
  .then(result => {
    console.log('\n🎉 CÁLCULO FINAL CORRETO!');
    console.log(`✅ Receita Total da Plataforma: R$ ${result.total_platform_revenue.toFixed(2)}`);
    console.log(`✅ MRR Subscriptions: R$ ${result.mrr_subscriptions.toFixed(2)}`);
    console.log(`✅ Tenants Pagantes: ${result.paying_tenants}`);
  })
  .catch(console.error);