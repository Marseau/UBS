const { supabaseAdmin } = require('./src/config/database');

async function calculateRealPlatformRevenue() {
  console.log('💰 CALCULANDO RECEITA REAL DA PLATAFORMA...\n');
  
  try {
    // 1. BUSCAR PAGAMENTOS REAIS DOS TENANTS À PLATAFORMA
    console.log('🔍 Consultando subscription_payments (tenants pagando à plataforma)...');
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('subscription_payments')
      .select('*')
      .order('payment_date', { ascending: false });
    
    if (paymentsError) {
      console.log('❌ Erro ao buscar payments:', paymentsError.message);
    } else {
      console.log(`📊 ${payments.length} registros de pagamentos encontrados`);
      
      if (payments.length > 0) {
        console.log('\n💳 PAGAMENTOS REAIS DOS ÚLTIMOS REGISTROS:');
        payments.slice(0, 10).forEach((payment, index) => {
          console.log(`   ${index + 1}. Tenant: ${payment.tenant_id.substring(0, 8)}...`);
          console.log(`      Plano: ${payment.subscription_plan}`);
          console.log(`      Valor: R$ ${payment.amount_brl || 'N/A'}`);
          console.log(`      Data: ${payment.payment_date}`);
          console.log('');
        });
        
        // Calcular receita mensal atual
        const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
        const currentMonthPayments = payments.filter(p => 
          p.payment_date && p.payment_date.startsWith(currentMonth)
        );
        
        const monthlyRevenue = currentMonthPayments.reduce((sum, p) => 
          sum + (p.amount_brl || 0), 0
        );
        
        console.log(`📊 RECEITA MENSAL (${currentMonth}): R$ ${monthlyRevenue.toFixed(2)}`);
        
        // Contar tenants pagantes únicos
        const payingTenants = new Set(payments
          .filter(p => p.amount_brl > 0)
          .map(p => p.tenant_id)
        ).size;
        
        console.log(`🏢 TENANTS PAGANTES ÚNICOS: ${payingTenants}`);
        
        // Calcular MRR real
        const lastPaymentsByTenant = {};
        payments.forEach(payment => {
          if (!lastPaymentsByTenant[payment.tenant_id] || 
              payment.payment_date > lastPaymentsByTenant[payment.tenant_id].payment_date) {
            lastPaymentsByTenant[payment.tenant_id] = payment;
          }
        });
        
        const realMRR = Object.values(lastPaymentsByTenant)
          .filter(p => p.subscription_plan !== 'free' && p.amount_brl > 0)
          .reduce((sum, p) => sum + (p.amount_brl || 0), 0);
        
        console.log(`💰 MRR REAL: R$ ${realMRR.toFixed(2)}`);
      }
    }
    
    // 2. BUSCAR COBRANÇA POR CONVERSAS (SE EXISTIR)
    console.log('\n🔍 Consultando conversation_billing...');
    const { data: billing, error: billingError } = await supabaseAdmin
      .from('conversation_billing')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (billingError) {
      console.log('❌ Erro ao buscar billing:', billingError.message);
    } else {
      console.log(`📊 ${billing.length} registros de billing encontrados`);
      
      if (billing.length > 0) {
        const totalBilling = billing.reduce((sum, b) => sum + (b.total_amount_brl || 0), 0);
        console.log(`💳 TOTAL BILLING: R$ ${totalBilling.toFixed(2)}`);
      } else {
        console.log('⚠️ Nenhum registro de conversation_billing encontrado');
      }
    }
    
    // 3. BUSCAR TENANTS E SEUS STATUS
    console.log('\n🔍 Consultando tenants e seus planos...');
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name, subscription_plan, status')
      .eq('status', 'active');
    
    if (!tenantsError) {
      console.log(`🏢 ${tenants.length} tenants ativos encontrados`);
      
      const planCounts = {};
      tenants.forEach(tenant => {
        const plan = tenant.subscription_plan || 'unknown';
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      });
      
      console.log('\n📊 DISTRIBUIÇÃO POR PLANO:');
      Object.entries(planCounts).forEach(([plan, count]) => {
        console.log(`   ${plan}: ${count} tenants`);
      });
    }
    
    console.log('\n🎯 ANÁLISE FINAL:');
    console.log('   💡 A receita da plataforma vem de subscription_payments');
    console.log('   💡 Não devemos somar receita dos tenants (appointments)');
    console.log('   💡 Dados reais mostram quantos tenants realmente pagam');
    console.log('   💡 MRR deve ser baseado em planos ativos, não assumido');
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

calculateRealPlatformRevenue().catch(console.error);