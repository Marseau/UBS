const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Estrutura de planos com trial de 15 dias
const SUBSCRIPTION_PLANS = {
  basico: {
    monthly_price_brl: 58.00,
    monthly_price_cents: 5800,
    conversations_included: 200,
    plan_name: 'Básico'
  },
  profissional: {
    monthly_price_brl: 116.00,
    monthly_price_cents: 11600,
    conversations_included: 400,
    plan_name: 'Profissional'
  },
  enterprise: {
    monthly_price_brl: 290.00,
    monthly_price_cents: 29000,
    conversations_included: 1250,
    plan_name: 'Enterprise'
  },
  free: {
    monthly_price_brl: 0.00,
    monthly_price_cents: 0,
    conversations_included: 50,
    plan_name: 'Free'
  }
};

// Status de pagamento possíveis
const PAYMENT_STATUS = ['succeeded', 'pending', 'failed', 'refunded'];
const SUBSCRIPTION_STATUS = ['trialing', 'active', 'past_due', 'canceled', 'unpaid'];

// Função para gerar data aleatória em um período
function getRandomDate(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Função para gerar ID de pagamento Stripe realístico
function generateStripePaymentId() {
  const prefixes = ['pi_', 'in_', 'ch_'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix;
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Função para calcular data do trial (15 dias após criação do tenant)
function calculateTrialEndDate(createdAt) {
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + 15);
  return trialEnd;
}

// Função para popular histórico de pagamentos com período de trial
async function populateSubscriptionPaymentsWithTrial() {
  console.log('🏗️ Populando histórico de pagamentos com período de trial de 15 dias...\n');

  try {
    // Buscar todos os tenants ativos e seus dados de billing
    console.log('🔍 Carregando tenants e dados de billing...');
    
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id,
        business_name,
        subscription_plan,
        created_at,
        status,
        domain
      `)
      .eq('status', 'active');

    if (tenantsError) {
      throw new Error(`Erro ao carregar tenants: ${tenantsError.message}`);
    }

    // Buscar dados do Stripe para correspondência
    const { data: stripeCustomers, error: stripeError } = await supabase
      .from('stripe_customers')
      .select(`
        tenant_id,
        stripe_customer_id,
        subscription_id,
        subscription_status,
        subscription_data
      `);

    if (stripeError) {
      throw new Error(`Erro ao carregar dados Stripe: ${stripeError.message}`);
    }

    console.log(`✅ ${tenants.length} tenants encontrados`);
    console.log(`✅ ${stripeCustomers?.length || 0} registros Stripe encontrados`);

    // Criar map de clientes Stripe por tenant_id
    const stripeMap = new Map();
    if (stripeCustomers) {
      stripeCustomers.forEach(customer => {
        stripeMap.set(customer.tenant_id, customer);
      });
    }

    // Limpar dados anteriores da tabela subscription_payments
    console.log('🧹 Limpando dados anteriores de subscription_payments...');
    const { error: deleteError } = await supabase
      .from('subscription_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.warn('⚠️ Aviso ao limpar dados:', deleteError.message);
    }

    const paymentsToInsert = [];
    const currentDate = new Date();
    
    console.log('\n📊 Gerando histórico de pagamentos para cada tenant...\n');

    for (const tenant of tenants) {
      const stripeData = stripeMap.get(tenant.id);
      const planConfig = SUBSCRIPTION_PLANS[tenant.subscription_plan] || SUBSCRIPTION_PLANS.basico;
      
      console.log(`🏢 Processando: ${tenant.business_name} (${planConfig.plan_name})`);

      // Calcular datas importantes
      const tenantCreatedAt = new Date(tenant.created_at);
      const trialEndDate = calculateTrialEndDate(tenantCreatedAt);
      const isTrialActive = currentDate < trialEndDate;
      const monthsSinceCreation = Math.floor((currentDate - tenantCreatedAt) / (1000 * 60 * 60 * 24 * 30));

      console.log(`   📅 Criado em: ${tenantCreatedAt.toLocaleDateString('pt-BR')}`);
      console.log(`   🎯 Trial até: ${trialEndDate.toLocaleDateString('pt-BR')}`);
      console.log(`   ${isTrialActive ? '🆓 Trial ATIVO' : '💰 Cobrando'}`);

      // 1. PERÍODO DE TRIAL (sempre gratuito)
      const trialPayment = {
        tenant_id: tenant.id,
        payment_date: tenantCreatedAt.toISOString().split('T')[0], // Only date part
        payment_period_start: tenantCreatedAt.toISOString().split('T')[0],
        payment_period_end: trialEndDate.toISOString().split('T')[0],
        amount: 0.00,
        currency: 'BRL',
        subscription_plan: 'free',
        payment_method: 'trial',
        payment_status: 'completed',
        stripe_payment_intent_id: 'trial_period',
        stripe_invoice_id: 'trial_invoice',
        payment_metadata: {
          trial_period: true,
          trial_days: 15,
          tenant_name: tenant.business_name,
          domain: tenant.domain,
          original_plan: tenant.subscription_plan,
          conversations_included: 200,
          conversations_used: Math.floor(Math.random() * 150) + 10,
          plan_name: 'Trial (15 dias)'
        }
      };

      paymentsToInsert.push(trialPayment);

      // 2. PAGAMENTOS MENSAIS (após o trial)
      if (!isTrialActive) {
        let currentPaymentDate = new Date(trialEndDate);
        
        for (let month = 0; month < monthsSinceCreation && month < 12; month++) {
          // Determinar status do pagamento (95% sucesso, 3% pendente, 2% falhou)
          const statusRandom = Math.random();
          let paymentStatus = 'succeeded';
          if (statusRandom > 0.97) paymentStatus = 'failed';
          else if (statusRandom > 0.95) paymentStatus = 'pending';

          // Calcular uso de conversas (80-120% do incluído, com alguns picos)
          const baseUsage = planConfig.conversations_included;
          const usageVariation = (Math.random() - 0.5) * 0.4; // ±20%
          const conversationsUsed = Math.floor(baseUsage * (1 + usageVariation));

          // Calcular valor com possível cobrança por excesso
          let finalAmount = planConfig.monthly_price_brl;
          let overageCharges = 0;
          
          if (tenant.subscription_plan === 'enterprise' && conversationsUsed > planConfig.conversations_included) {
            overageCharges = (conversationsUsed - planConfig.conversations_included) * 0.25;
            finalAmount += overageCharges;
          }

          const periodEndDate = new Date(currentPaymentDate.getFullYear(), currentPaymentDate.getMonth() + 1, currentPaymentDate.getDate());
          
          // Map tenant subscription plans to allowed values in subscription_payments table
          const planMapping = {
            'basico': 'pro',
            'profissional': 'professional', 
            'enterprise': 'enterprise',
            'free': 'free'
          };
          
          const monthlyPayment = {
            tenant_id: tenant.id,
            payment_date: currentPaymentDate.toISOString().split('T')[0], // Only date part
            payment_period_start: currentPaymentDate.toISOString().split('T')[0],
            payment_period_end: periodEndDate.toISOString().split('T')[0],
            amount: parseFloat(finalAmount.toFixed(2)),
            currency: 'BRL',
            subscription_plan: planMapping[tenant.subscription_plan] || 'pro',
            payment_method: 'stripe',
            payment_status: paymentStatus === 'succeeded' ? 'completed' : paymentStatus,
            stripe_payment_intent_id: generateStripePaymentId(),
            stripe_invoice_id: `in_${generateStripePaymentId().slice(3)}`,
            payment_metadata: {
              trial_period: false,
              overage_conversations: Math.max(0, conversationsUsed - planConfig.conversations_included),
              overage_charges_brl: overageCharges,
              tenant_name: tenant.business_name,
              domain: tenant.domain,
              billing_cycle: month + 1,
              plan_name: planConfig.plan_name,
              conversations_included: planConfig.conversations_included,
              conversations_used: conversationsUsed,
              stripe_customer_id: stripeData?.stripe_customer_id || null,
              payment_method_details: ['card_ending_1234', 'card_ending_5678', 'boleto', 'card_ending_9012'][Math.floor(Math.random() * 4)]
            }
          };

          paymentsToInsert.push(monthlyPayment);

          // Próximo mês
          currentPaymentDate.setMonth(currentPaymentDate.getMonth() + 1);
        }
      }

      console.log(`   ✅ ${isTrialActive ? 'Trial + 0 pagamentos' : `Trial + ${monthsSinceCreation} pagamentos`}`);
    }

    console.log(`\n📊 Inserindo ${paymentsToInsert.length} registros de pagamento...`);

    // Inserir todos os pagamentos em lotes
    const batchSize = 100;
    for (let i = 0; i < paymentsToInsert.length; i += batchSize) {
      const batch = paymentsToInsert.slice(i, i + batchSize);
      
      const { error: insertError } = await supabase
        .from('subscription_payments')
        .insert(batch);

      if (insertError) {
        throw new Error(`Erro ao inserir lote ${Math.floor(i/batchSize) + 1}: ${insertError.message}`);
      }

      console.log(`   ✅ Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(paymentsToInsert.length/batchSize)} inserido`);
    }

    // Estatísticas finais
    console.log('\n📈 Gerando estatísticas...');

    const trialPayments = paymentsToInsert.filter(p => p.payment_metadata?.trial_period === true);
    const paidPayments = paymentsToInsert.filter(p => p.payment_metadata?.trial_period !== true);
    const totalRevenue = paidPayments.reduce((sum, p) => sum + p.amount, 0);
    const successfulPayments = paidPayments.filter(p => p.payment_status === 'completed');
    const failedPayments = paidPayments.filter(p => p.payment_status === 'failed');

    const stats = {
      totalPayments: paymentsToInsert.length,
      trialPayments: trialPayments.length,
      paidPayments: paidPayments.length,
      totalRevenue: totalRevenue,
      successfulPayments: successfulPayments.length,
      failedPayments: failedPayments.length,
      successRate: paidPayments.length > 0 ? (successfulPayments.length / paidPayments.length) * 100 : 0,
      avgMonthlyRevenue: paidPayments.length > 0 ? totalRevenue / Math.max(1, Math.floor(paidPayments.length / tenants.length)) : 0,
      tenantsInTrial: trialPayments.length,
      tenantsPayingCustomers: [...new Set(successfulPayments.map(p => p.tenant_id))].length
    };

    // Relatório final
    console.log('\n🎉 POPULAÇÃO DE PAGAMENTOS COMPLETA!');
    console.log('=' .repeat(50));
    
    console.log('\n📊 ESTATÍSTICAS GERAIS:');
    console.log(`   • ${stats.totalPayments} registros de pagamento criados`);
    console.log(`   • ${stats.trialPayments} períodos de trial (15 dias cada)`);
    console.log(`   • ${stats.paidPayments} pagamentos mensais`);
    console.log(`   • R$ ${stats.totalRevenue.toFixed(2)} receita total`);
    console.log(`   • ${stats.successRate.toFixed(1)}% taxa de sucesso nos pagamentos`);
    
    console.log('\n🎯 PERFORMANCE:');
    console.log(`   • ${stats.tenantsInTrial} tenants em trial`);
    console.log(`   • ${stats.tenantsPayingCustomers} tenants pagantes ativos`);
    console.log(`   • R$ ${stats.avgMonthlyRevenue.toFixed(2)} receita média mensal por tenant`);
    
    console.log('\n💳 STATUS DOS PAGAMENTOS:');
    console.log(`   • ${stats.successfulPayments} pagamentos bem-sucedidos`);
    console.log(`   • ${stats.failedPayments} pagamentos falharam`);
    console.log(`   • ${paidPayments.filter(p => p.payment_status === 'pending').length} pagamentos pendentes`);

    console.log('\n📅 ESTRUTURA DE TRIAL:');
    console.log(`   • 15 dias de trial gratuito para todos`);
    console.log(`   • 200 conversas incluídas no trial`);
    console.log(`   • Upgrade automático após trial`);
    console.log(`   • Histórico completo desde criação do tenant`);

    console.log('\n✅ Dados populados com sucesso!');
    console.log('💡 Agora o sistema tem histórico completo de pagamentos com trial period.');

    return stats;

  } catch (error) {
    console.error('❌ Erro ao popular subscription_payments:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  populateSubscriptionPaymentsWithTrial()
    .then(stats => {
      console.log('\n🚀 Script executado com sucesso!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Falha na execução:', error);
      process.exit(1);
    });
}

module.exports = { populateSubscriptionPaymentsWithTrial };