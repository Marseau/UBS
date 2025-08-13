/**
 * VALIDATE TENANT METRIC 1: total_conversations
 * Validar cálculo de conversas por tenant individual
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function validateTenantConversationsMetric() {
  console.log('🏢 TENANT MÉTRICA 1: total_conversations');
  console.log('='.repeat(60));

  try {
    // 1. BUSCAR DADOS ATUAIS DA TENANT_METRICS
    console.log('\n📊 1. DADOS ATUAIS DA TENANT_METRICS:');
    const { data: tenantMetrics, error } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data')
      .eq('metric_type', 'billing_analysis')
      .limit(5); // Primeiros 5 para validação

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    console.log(`✅ Encontrados ${tenantMetrics?.length || 0} registros para validar`);

    // 2. VALIDAR CADA TENANT INDIVIDUALMENTE
    for (let i = 0; i < Math.min(5, tenantMetrics?.length || 0); i++) {
      const tenant = tenantMetrics[i];
      const tenantId = tenant.tenant_id;
      const metricData = tenant.metric_data;
      const jobConversations = metricData?.total_conversations || 0;

      console.log(`\n🏢 TENANT ${i + 1}: ${metricData?.business_name || 'Unknown'}`);
      console.log(`   ID: ${tenantId}`);
      console.log(`   Conversas no job: ${jobConversations}`);

      // 3. CALCULAR VALOR CORRETO (FONTE DE VERDADE)
      console.log('\n   ✅ CALCULANDO VALOR CORRETO:');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Conversas com conversation_outcome para este tenant
      const { data: realConversations, error: convError } = await supabase
        .from('conversation_history')
        .select('id, conversation_outcome, created_at')
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (convError) {
        console.log(`   ❌ Erro ao buscar conversas: ${convError.message}`);
        continue;
      }

      const realConversationsCount = realConversations?.length || 0;
      console.log(`   Conversas reais: ${realConversationsCount}`);

      // 4. COMPARAÇÃO
      const difference = jobConversations - realConversationsCount;
      const isCorrect = difference === 0;
      
      console.log(`\n   🔍 COMPARAÇÃO:`);
      console.log(`   Job: ${jobConversations}`);
      console.log(`   Real: ${realConversationsCount}`);
      console.log(`   Diferença: ${difference > 0 ? '+' : ''}${difference}`);
      console.log(`   Status: ${isCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);

      if (!isCorrect && realConversationsCount > 0) {
        console.log(`   Erro: ${((difference / realConversationsCount) * 100).toFixed(1)}%`);
      }

      // 5. DETALHES DAS CONVERSAS (se incorreto)
      if (!isCorrect && realConversations && realConversations.length > 0) {
        console.log(`\n   📋 DETALHES DAS CONVERSAS REAIS:`);
        const outcomeCount = {};
        realConversations.forEach(conv => {
          const outcome = conv.conversation_outcome || 'null';
          outcomeCount[outcome] = (outcomeCount[outcome] || 0) + 1;
        });

        Object.entries(outcomeCount).forEach(([outcome, count]) => {
          console.log(`   ${outcome}: ${count}`);
        });

        // Comparar com outcome_distribution do job
        if (metricData?.outcome_distribution) {
          console.log(`\n   📊 OUTCOME_DISTRIBUTION NO JOB:`);
          Object.entries(metricData.outcome_distribution).forEach(([outcome, count]) => {
            console.log(`   ${outcome}: ${count}`);
          });
        }
      }

      console.log(`   ${'='.repeat(40)}`);
    }

    // 6. ANÁLISE GERAL
    console.log('\n📊 6. ANÁLISE GERAL:');
    let correctCount = 0;
    let totalValidated = 0;

    for (const tenant of tenantMetrics?.slice(0, 5) || []) {
      const tenantId = tenant.tenant_id;
      const jobConversations = tenant.metric_data?.total_conversations || 0;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: realConversations } = await supabase
        .from('conversation_history')
        .select('id')
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const realCount = realConversations?.length || 0;
      
      if (jobConversations === realCount) {
        correctCount++;
      }
      totalValidated++;
    }

    console.log(`   ✅ Corretos: ${correctCount}/${totalValidated}`);
    console.log(`   📊 Taxa de acerto: ${((correctCount / totalValidated) * 100).toFixed(1)}%`);

    // 7. CONCLUSÃO
    console.log('\n🎯 7. CONCLUSÃO:');
    if (correctCount === totalValidated) {
      console.log('   ✅ MÉTRICA CORRETA! Cálculo de conversas por tenant está funcionando.');
    } else {
      console.log('   ❌ MÉTRICA INCORRETA! Problemas identificados no cálculo.');
      console.log('\n   💡 POSSÍVEIS CAUSAS:');
      console.log('   1. Período de cálculo diferente (não é 30 dias)');
      console.log('   2. Filtro de conversation_outcome incorreto');
      console.log('   3. Tenant_id não está sendo filtrado corretamente');
      console.log('   4. Dados duplicados sendo contados');
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏢 VALIDAÇÃO TENANT MÉTRICA 1 CONCLUÍDA - AGUARDANDO APROVAÇÃO');
}

validateTenantConversationsMetric();