const { supabaseAdmin } = require('./src/config/database');

async function calculatePlatformRevenueFinalCorrect() {
  console.log('💰 CALCULANDO RECEITA FINAL CORRETA DA PLATAFORMA...\n');
  
  try {
    // 1. BUSCAR PAGAMENTOS NÃO-TRIAL (REAIS)
    console.log('🔍 Buscando pagamentos reais (não-trial)...');
    const { data: realPayments, error } = await supabaseAdmin
      .from('subscription_payments')
      .select('*')
      .neq('payment_method', 'trial')
      .eq('payment_status', 'completed')
      .order('payment_date', { ascending: false });
    
    if (error) {
      throw new Error(`Erro: ${error.message}`);
    }
    
    console.log(`📊 ${realPayments.length} pagamentos reais encontrados\n`);
    
    // 2. CALCULAR MRR - ÚLTIMO PAGAMENTO DE CADA TENANT
    const lastPaymentsByTenant = {};
    realPayments.forEach(payment => {
      if (!lastPaymentsByTenant[payment.tenant_id] || 
          payment.payment_date > lastPaymentsByTenant[payment.tenant_id].payment_date) {
        lastPaymentsByTenant[payment.tenant_id] = payment;
      }
    });
    
    console.log('💰 CÁLCULO MRR POR TENANT:');
    let totalMRR = 0;
    
    Object.values(lastPaymentsByTenant).forEach((payment, index) => {
      const amount = payment.amount;
      totalMRR += amount;
      
      console.log(`${index + 1}. Tenant: ${payment.tenant_id.substring(0, 8)}...`);
      console.log(`   Plano: ${payment.subscription_plan}`);
      console.log(`   Último Pagamento: ${payment.payment_date}`);
      console.log(`   Valor: R$ ${amount.toFixed(2)}`);
      console.log('');
    });
    
    // 3. RECEITA TOTAL HISTÓRICA
    const totalHistoricalRevenue = realPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // 4. BREAKDOWN POR PLANO
    const planBreakdown = {};
    Object.values(lastPaymentsByTenant).forEach(payment => {
      const plan = payment.subscription_plan;
      if (!planBreakdown[plan]) {
        planBreakdown[plan] = { count: 0, revenue: 0 };
      }
      planBreakdown[plan].count++;
      planBreakdown[plan].revenue += payment.amount;
    });
    
    console.log('📊 BREAKDOWN POR PLANO:');
    Object.entries(planBreakdown).forEach(([plan, data]) => {
      console.log(`   ${plan}: ${data.count} tenants → R$ ${data.revenue.toFixed(2)}/mês`);
    });
    
    console.log('\n🎯 RECEITA FINAL DA PLATAFORMA:');
    console.log(`💰 MRR: R$ ${totalMRR.toFixed(2)}`);
    console.log(`📊 Tenants Pagantes: ${Object.keys(lastPaymentsByTenant).length}`);
    console.log(`💰 Receita Histórica Total: R$ ${totalHistoricalRevenue.toFixed(2)}`);
    console.log(`💡 ARR Projetado: R$ ${(totalMRR * 12).toFixed(2)}`);
    
    return {
      mrr: totalMRR,
      paying_tenants: Object.keys(lastPaymentsByTenant).length,
      historical_revenue: totalHistoricalRevenue,
      plan_breakdown: planBreakdown,
      last_payments: lastPaymentsByTenant
    };
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  }
}

calculatePlatformRevenueFinalCorrect()
  .then(result => {
    console.log('\n✅ CÁLCULO FINAL CORRETO CONCLUÍDO!');
    console.log(`💰 RECEITA PLATAFORMA: R$ ${result.mrr.toFixed(2)} MRR`);
  })
  .catch(console.error);