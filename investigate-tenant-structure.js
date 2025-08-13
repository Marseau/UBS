const { supabaseAdmin } = require('./src/config/database');

async function investigateTenantStructure() {
  console.log('🔍 INVESTIGANDO ESTRUTURA DA TABELA TENANTS...\n');
  
  try {
    // 1. BUSCAR TENANTS COM TODOS OS CAMPOS DISPONÍVEIS
    console.log('📊 Buscando tenants ativos...');
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('status', 'active')
      .limit(5);
    
    if (tenantsError) {
      throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
    }
    
    console.log(`✅ ${tenants.length} tenants encontrados\n`);
    
    if (tenants.length > 0) {
      console.log('🔧 ESTRUTURA DO PRIMEIRO TENANT:');
      const firstTenant = tenants[0];
      const fields = Object.keys(firstTenant);
      
      fields.forEach((field, index) => {
        const value = firstTenant[field];
        const type = typeof value;
        console.log(`   ${index + 1}. ${field}: ${type} = ${value}`);
      });
      
      console.log(`\n📊 TOTAL DE CAMPOS: ${fields.length}`);
    }
    
    // 2. BUSCAR DADOS DE SUBSCRIPTION PARA IDENTIFICAR TRIAL
    console.log('\n🔍 Investigando subscription_payments...');
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('subscription_payments')
      .select('*')
      .limit(5);
    
    if (!paymentsError && payments.length > 0) {
      console.log('\n💳 ESTRUTURA SUBSCRIPTION_PAYMENTS:');
      const paymentFields = Object.keys(payments[0]);
      paymentFields.forEach((field, index) => {
        const value = payments[0][field];
        const type = typeof value;
        console.log(`   ${index + 1}. ${field}: ${type} = ${value}`);
      });
    }
    
    // 3. ANALISAR COMO IDENTIFICAR PÓS-TRIAL
    console.log('\n🎯 ANÁLISE DE TENANTS ATIVOS:');
    tenants.forEach((tenant, index) => {
      console.log(`\n${index + 1}. ${tenant.business_name || 'N/A'}`);
      console.log(`   ID: ${tenant.id.substring(0, 8)}...`);
      console.log(`   Plano: ${tenant.subscription_plan}`);
      console.log(`   Status: ${tenant.status}`);
      console.log(`   Criado: ${tenant.created_at}`);
      
      // Verificar se tem campos relacionados a trial
      if (tenant.trial_start_date) console.log(`   Trial Start: ${tenant.trial_start_date}`);
      if (tenant.trial_expires_at) console.log(`   Trial Expires: ${tenant.trial_expires_at}`);
      if (tenant.subscription_start_date) console.log(`   Subscription Start: ${tenant.subscription_start_date}`);
      if (tenant.last_payment_date) console.log(`   Last Payment: ${tenant.last_payment_date}`);
      
      // Calcular idade do tenant (indicativo de pós-trial)
      const createdDate = new Date(tenant.created_at);
      const now = new Date();
      const daysSinceCreation = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      console.log(`   Dias desde criação: ${daysSinceCreation}`);
      
      // Assumir que tenants com mais de 30 dias passaram do trial
      const likelyPostTrial = daysSinceCreation > 30;
      console.log(`   Provável pós-trial: ${likelyPostTrial ? '✅ SIM' : '❌ NÃO'}`);
    });
    
    return { tenants, payments };
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  }
}

investigateTenantStructure()
  .then(result => {
    console.log('\n🎯 INVESTIGAÇÃO CONCLUÍDA!');
    console.log('💡 Use os dados acima para calcular receita correta');
  })
  .catch(console.error);