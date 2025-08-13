/**
 * ANALYZE ALL JOB PROBLEMS
 * Verificar TODOS os problemas no job, não só o MRR
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function analyzeAllJobProblems() {
  console.log('🔍 ANALISANDO TODOS OS PROBLEMAS DO JOB');
  console.log('='.repeat(60));

  try {
    // 1. Buscar dados que o job está usando
    console.log('\n📊 1. DADOS QUE O JOB ESTÁ USANDO:');
    const { data: jobData, error: jobError } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data')
      .eq('metric_type', 'billing_analysis');

    if (jobError) {
      console.log('❌ Erro:', jobError);
      return;
    }

    console.log(`✅ Job está processando ${jobData?.length || 0} registros`);

    // 2. Analisar problemas em cada campo
    let totalTenants = jobData?.length || 0;
    let totalConversations = 0;
    let totalBillableConversations = 0;
    let totalMonthlyRevenue_wrong = 0; // Campo errado
    let totalMonthlyRevenue_correct = 0; // Campo correto
    let totalAppointments = 0;
    let spamConversations = 0;

    console.log('\n📊 2. ANÁLISE CAMPO POR CAMPO:');
    
    jobData?.forEach((tenant, i) => {
      const data = tenant.metric_data;
      
      if (i < 3) { // Mostrar detalhes dos primeiros 3
        console.log(`\n🏢 Tenant ${i + 1} (${tenant.tenant_id}):`);
        console.log(`   business_name: ${data.business_name}`);
        console.log(`   total_conversations: ${data.total_conversations}`);
        console.log(`   billable_conversations: ${data.billable_conversations}`);
        console.log(`   total_appointments: ${data.total_appointments}`);
        console.log(`   plan_price_brl: ${data.plan_price_brl} ✅`);
        console.log(`   total_monthly_charge: ${data.total_monthly_charge || 'UNDEFINED ❌'}`);
        console.log(`   base_monthly_charge: ${data.base_monthly_charge || 'UNDEFINED ❌'}`);
        console.log(`   excess_charge: ${data.excess_charge || 'UNDEFINED ❌'}`);
        console.log(`   spam_conversations: ${data.spam_conversations}`);
        
        // Verificar campos de outcome que podem estar como appointments
        console.log(`   outcome_distribution:`, JSON.stringify(data.outcome_distribution, null, 4));
      }

      if (data) {
        totalConversations += data.total_conversations || 0;
        totalBillableConversations += data.billable_conversations || 0;
        totalAppointments += data.total_appointments || 0;
        spamConversations += data.spam_conversations || 0;
        
        // Campo ERRADO que o job está usando
        totalMonthlyRevenue_wrong += data.total_monthly_charge || 0;
        totalMonthlyRevenue_correct += data.plan_price_brl || 0;
      }
    });

    console.log('\n📊 3. COMPARAÇÃO DE TOTAIS:');
    console.log(`   🏢 Tenants: ${totalTenants}`);
    console.log(`   💬 Conversas: ${totalConversations}`);
    console.log(`   💬 Conversas cobráveis: ${totalBillableConversations}`);
    console.log(`   📅 Appointments: ${totalAppointments}`);
    console.log(`   🚫 Spam: ${spamConversations}`);
    console.log(`   💰 MRR (campo errado): R$ ${totalMonthlyRevenue_wrong} ❌`);
    console.log(`   💰 MRR (campo correto): R$ ${totalMonthlyRevenue_correct} ✅`);

    // 4. Comparar com dados reais diretos
    console.log('\n📊 4. COMPARAÇÃO COM DADOS REAIS (30 DIAS):');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Conversas reais
    const { data: realConversations } = await supabase
      .from('conversation_history')
      .select('tenant_id, conversation_outcome')
      .not('conversation_outcome', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Appointments reais
    const { data: realAppointments } = await supabase
      .from('appointments')
      .select('tenant_id, status')
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Tenants ativos reais
    const { data: realTenants } = await supabase
      .from('tenants')
      .select('id, business_name, status, subscription_plan')
      .eq('status', 'active');

    console.log(`   🏢 Tenants reais ativos: ${realTenants?.length || 0}`);
    console.log(`   💬 Conversas reais: ${realConversations?.length || 0}`);
    console.log(`   📅 Appointments reais: ${realAppointments?.length || 0}`);

    // 5. Identificar discrepâncias
    console.log('\n🚨 5. DISCREPÂNCIAS IDENTIFICADAS:');
    
    if (totalTenants !== realTenants?.length) {
      console.log(`   ❌ Tenants: Job=${totalTenants} vs Real=${realTenants?.length || 0} (diferença: ${totalTenants - (realTenants?.length || 0)})`);
    }
    
    if (totalConversations !== realConversations?.length) {
      console.log(`   ❌ Conversas: Job=${totalConversations} vs Real=${realConversations?.length || 0} (diferença: ${totalConversations - (realConversations?.length || 0)})`);
    }
    
    if (totalAppointments !== realAppointments?.length) {
      console.log(`   ❌ Appointments: Job=${totalAppointments} vs Real=${realAppointments?.length || 0} (diferença: ${totalAppointments - (realAppointments?.length || 0)})`);
    }

    if (totalMonthlyRevenue_wrong === 0) {
      console.log(`   ❌ MRR: Job usa campo 'total_monthly_charge' que está vazio/undefined`);
      console.log(`   ✅ Solução: Usar campo 'plan_price_brl' que tem valor R$ ${totalMonthlyRevenue_correct}`);
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 ANÁLISE COMPLETA CONCLUÍDA');
}

analyzeAllJobProblems();