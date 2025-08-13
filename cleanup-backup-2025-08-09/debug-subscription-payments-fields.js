const { supabaseAdmin } = require('./src/config/database');

async function debugSubscriptionPaymentsFields() {
  console.log('🔍 DEBUGANDO CAMPOS SUBSCRIPTION_PAYMENTS...\n');
  
  try {
    // Buscar todos os campos dos pagamentos mais recentes
    const { data: payments, error } = await supabaseAdmin
      .from('subscription_payments')
      .select('*')
      .order('payment_date', { ascending: false })
      .limit(5);
    
    if (error) {
      throw new Error(`Erro: ${error.message}`);
    }
    
    console.log(`📊 ${payments.length} registros encontrados\n`);
    
    if (payments.length > 0) {
      console.log('🔧 ESTRUTURA COMPLETA DO PRIMEIRO PAGAMENTO:');
      const firstPayment = payments[0];
      const fields = Object.keys(firstPayment);
      
      fields.forEach((field, index) => {
        const value = firstPayment[field];
        const type = typeof value;
        console.log(`   ${index + 1}. ${field}: ${type} = ${value}`);
      });
      
      console.log(`\n📊 TOTAL DE CAMPOS: ${fields.length}`);
      
      // Verificar valores não-zero
      console.log('\n💰 ANÁLISE DE VALORES:');
      payments.forEach((payment, index) => {
        console.log(`\n${index + 1}. Payment ID: ${payment.id?.substring(0, 8)}...`);
        console.log(`   Date: ${payment.payment_date}`);
        console.log(`   Plan: ${payment.subscription_plan}`);
        console.log(`   Amount: ${payment.amount}`);
        console.log(`   Amount BRL: ${payment.amount_brl || 'N/A'}`);
        console.log(`   Status: ${payment.payment_status}`);
        console.log(`   Method: ${payment.payment_method}`);
        
        if (payment.payment_metadata) {
          console.log(`   Trial: ${payment.payment_metadata.trial_period}`);
          if (payment.payment_metadata.plan_name) {
            console.log(`   Plan Name: ${payment.payment_metadata.plan_name}`);
          }
        }
      });
      
      // Calcular receita baseada no campo correto
      console.log('\n🎯 CÁLCULO DE RECEITA:');
      let totalRevenue = 0;
      let payingTenants = new Set();
      
      payments.forEach(payment => {
        const amount = payment.amount || payment.amount_brl || 0;
        if (amount > 0) {
          totalRevenue += amount;
          payingTenants.add(payment.tenant_id);
        }
      });
      
      console.log(`💰 Total Receita (amostra): R$ ${totalRevenue.toFixed(2)}`);
      console.log(`🏢 Tenants Pagantes (amostra): ${payingTenants.size}`);
      
      // Buscar apenas pagamentos não-trial
      console.log('\n🔍 BUSCANDO PAGAMENTOS NÃO-TRIAL...');
      const { data: paidPayments, error: paidError } = await supabaseAdmin
        .from('subscription_payments')
        .select('*')
        .neq('payment_method', 'trial')
        .order('payment_date', { ascending: false });
      
      if (!paidError && paidPayments.length > 0) {
        console.log(`📊 ${paidPayments.length} pagamentos não-trial encontrados`);
        
        let realRevenue = 0;
        const realPayingTenants = new Set();
        
        paidPayments.forEach(payment => {
          const amount = payment.amount || payment.amount_brl || 0;
          realRevenue += amount;
          if (amount > 0) {
            realPayingTenants.add(payment.tenant_id);
          }
        });
        
        console.log(`💰 RECEITA REAL TOTAL: R$ ${realRevenue.toFixed(2)}`);
        console.log(`🏢 TENANTS PAGANTES REAIS: ${realPayingTenants.size}`);
        
        // MRR (receita do último mês de cada tenant)
        const lastPaymentsByTenant = {};
        paidPayments.forEach(payment => {
          if (!lastPaymentsByTenant[payment.tenant_id] || 
              payment.payment_date > lastPaymentsByTenant[payment.tenant_id].payment_date) {
            lastPaymentsByTenant[payment.tenant_id] = payment;
          }
        });
        
        let mrr = 0;
        Object.values(lastPaymentsByTenant).forEach(payment => {
          const amount = payment.amount || payment.amount_brl || 0;
          mrr += amount;
        });
        
        console.log(`💰 MRR REAL: R$ ${mrr.toFixed(2)}`);
        console.log(`📊 TENANTS NO MRR: ${Object.keys(lastPaymentsByTenant).length}`);
      } else {
        console.log('❌ Nenhum pagamento não-trial encontrado');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

debugSubscriptionPaymentsFields().catch(console.error);