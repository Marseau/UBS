/**
 * VALIDATE METRIC 2: TOTAL CONVERSATIONS
 * Validar métrica de conversas totais passo a passo
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function validateTotalConversationsMetric() {
  console.log('🎯 MÉTRICA 2: TOTAL CONVERSATIONS');
  console.log('='.repeat(50));

  try {
    // 1. VALOR ATUAL DO JOB
    console.log('\n📊 1. VALOR ATUAL DO JOB:');
    const { data: currentMetric } = await supabase
      .from('platform_metrics')
      .select('total_conversations')
      .order('created_at', { ascending: false })
      .limit(1);

    const jobValue = currentMetric?.[0]?.total_conversations || 0;
    console.log(`   Job calculou: ${jobValue} conversas`);

    // 2. VALOR CORRETO (FONTE DE VERDADE) - 30 dias
    console.log('\n✅ 2. VALOR CORRETO (FONTE DE VERDADE - 30 DIAS):');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Conversas com conversation_outcome (definição correta)
    const { data: correctConversations, error } = await supabase
      .from('conversation_history')
      .select('tenant_id, conversation_outcome, created_at')
      .not('conversation_outcome', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    const correctValue = correctConversations?.length || 0;
    console.log(`   Valor correto: ${correctValue} conversas (com conversation_outcome)`);

    // 3. COMPARAÇÃO POR TENANT (para debug)
    console.log('\n🔍 3. CONVERSAS POR TENANT (DADOS REAIS):');
    const conversasPorTenant = {};
    correctConversations?.forEach(conv => {
      if (!conversasPorTenant[conv.tenant_id]) {
        conversasPorTenant[conv.tenant_id] = 0;
      }
      conversasPorTenant[conv.tenant_id]++;
    });

    // Buscar nomes dos tenants
    const tenantIds = Object.keys(conversasPorTenant);
    const { data: tenantNames } = await supabase
      .from('tenants')
      .select('id, business_name')
      .in('id', tenantIds);

    const tenantNamesMap = {};
    tenantNames?.forEach(t => {
      tenantNamesMap[t.id] = t.business_name;
    });

    Object.entries(conversasPorTenant).forEach(([tenantId, count]) => {
      console.log(`   ${tenantNamesMap[tenantId] || 'Unknown'}: ${count} conversas`);
    });

    // 4. COMPARAÇÃO COM DADOS DO JOB
    console.log('\n📊 4. DADOS QUE O JOB ESTÁ USANDO:');
    const { data: jobSource } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data')
      .eq('metric_type', 'billing_analysis');

    let jobConversationsSum = 0;
    let jobTenantsWithConversations = 0;

    console.log('\n   📋 CONVERSAS POR TENANT (DADOS DO JOB):');
    jobSource?.forEach((tenant, i) => {
      const data = tenant.metric_data;
      const conversations = data?.total_conversations || 0;
      jobConversationsSum += conversations;
      
      if (conversations > 0) {
        jobTenantsWithConversations++;
      }

      if (i < 10) { // Mostrar primeiros 10
        console.log(`   ${data?.business_name || 'Unknown'}: ${conversations} conversas`);
      }
    });

    console.log(`\n   Total no job: ${jobConversationsSum} conversas`);
    console.log(`   Tenants com conversas: ${jobTenantsWithConversations}`);

    // 5. COMPARAÇÃO E ANÁLISE
    console.log('\n🔍 5. COMPARAÇÃO:');
    const difference = jobValue - correctValue;
    const isCorrect = difference === 0;

    console.log(`   Job: ${jobValue}`);
    console.log(`   Real: ${correctValue}`);
    console.log(`   Diferença: ${difference > 0 ? '+' : ''}${difference}`);
    console.log(`   Status: ${isCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);

    if (!isCorrect) {
      console.log(`   Erro: ${((difference / correctValue) * 100).toFixed(1)}%`);
    }

    // 6. INVESTIGAR OUTRAS POSSIBILIDADES
    console.log('\n🔍 6. OUTRAS POSSIBILIDADES:');
    
    // Todas as conversas (incluindo sem outcome)
    const { data: allConversations } = await supabase
      .from('conversation_history')
      .select('conversation_outcome, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const withOutcome = allConversations?.filter(c => c.conversation_outcome !== null).length || 0;
    const withoutOutcome = allConversations?.filter(c => c.conversation_outcome === null).length || 0;
    const total = allConversations?.length || 0;

    console.log(`   Conversas COM outcome: ${withOutcome}`);
    console.log(`   Conversas SEM outcome: ${withoutOutcome}`);
    console.log(`   Total geral: ${total}`);

    // 7. SOLUÇÃO PROPOSTA
    console.log('\n🔧 7. SOLUÇÃO PROPOSTA:');
    if (isCorrect) {
      console.log('   ✅ Métrica está correta! Não precisa correção.');
    } else {
      console.log('   ❌ Correção necessária no job:');
      console.log('   1. Usar query direta da conversation_history');
      console.log('   2. Filtrar por período correto (30 dias)');
      console.log('   3. Contar apenas conversas com conversation_outcome NOT NULL');
      console.log('   4. Filtrar apenas tenants ativos');
      
      console.log('\n   💡 CÓDIGO SUGERIDO:');
      console.log(`   const thirtyDaysAgo = new Date();`);
      console.log(`   thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);`);
      console.log(`   `);
      console.log(`   const { data: conversations } = await supabase`);
      console.log(`     .from('conversation_history')`);
      console.log(`     .select('tenant_id')`);
      console.log(`     .not('conversation_outcome', 'is', null)`);
      console.log(`     .gte('created_at', thirtyDaysAgo.toISOString())`);
      console.log(`     .in('tenant_id', activeTenantsIds);`);
      console.log(`   `);
      console.log(`   const totalConversations = conversations?.length || 0;`);
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎯 VALIDAÇÃO MÉTRICA 2 CONCLUÍDA');
}

validateTotalConversationsMetric();