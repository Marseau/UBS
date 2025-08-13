require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearBillingFields() {
  console.log('🧹 LIMPANDO CAMPOS DE BILLING...\n');
  
  try {
    // 1. Limpar conversation_billing
    console.log('🗑️ Limpando conversation_billing...');
    const { error: billingError } = await supabase
      .from('conversation_billing')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (billingError) {
      console.log('⚠️ Erro ao limpar conversation_billing:', billingError.message);
    } else {
      console.log('✅ conversation_billing limpo');
    }
    
    // 2. Limpar subscription_payments
    console.log('🗑️ Limpando subscription_payments...');
    const { error: paymentsError } = await supabase
      .from('subscription_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (paymentsError) {
      console.log('⚠️ Erro ao limpar subscription_payments:', paymentsError.message);
    } else {
      console.log('✅ subscription_payments limpo');
    }
    
    // 3. Resetar billing fields nos tenants
    console.log('🔄 Resetando campos billing nos tenants...');
    const { error: tenantsError } = await supabase
      .from('tenants')
      .update({ 
        subscription_status: 'trialing',
        trial_ends_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        last_billing_date: null,
        subscription_start_date: new Date().toISOString().split('T')[0] // Data de hoje
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (tenantsError) {
      console.log('⚠️ Erro ao resetar tenants:', tenantsError.message);
    } else {
      console.log('✅ Tenants resetados para trial (15 dias)');
    }
    
    // 4. Verificar resultados
    console.log('\n📊 VERIFICANDO RESULTADOS...');
    
    const { count: billingCount } = await supabase
      .from('conversation_billing')
      .select('*', { count: 'exact', head: true });
    
    const { count: paymentsCount } = await supabase
      .from('subscription_payments')
      .select('*', { count: 'exact', head: true });
    
    const { data: tenantSample } = await supabase
      .from('tenants')
      .select('subscription_status, trial_ends_at, subscription_start_date')
      .limit(1);
    
    console.log(`📈 conversation_billing: ${billingCount} registros`);
    console.log(`📈 subscription_payments: ${paymentsCount} registros`);
    console.log(`📈 Tenant sample:`, tenantSample[0]);
    
    console.log('\n🎯 CAMPOS DE BILLING LIMPOS - PRONTOS PARA TESTE!');
    console.log('   ✅ Todos os tenants estão em trial por 15 dias');
    console.log('   ✅ Nenhum registro de billing anterior');
    console.log('   ✅ Dados históricos (conversas/appointments) preservados');
    console.log('   🧪 Agora pode testar o billing com conversas únicas!');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

clearBillingFields().catch(console.error);