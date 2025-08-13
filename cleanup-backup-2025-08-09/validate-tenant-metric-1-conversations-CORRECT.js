/**
 * VALIDATE TENANT METRIC 1: total_conversations - CORREÇÃO
 * Validar contando SESSION_IDs únicos (método correto)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function validateTenantConversationsMetricCORRECT() {
  console.log('🏢 TENANT MÉTRICA 1: total_conversations - VALIDAÇÃO CORRETA');
  console.log('='.repeat(70));

  try {
    // 1. BUSCAR DADOS ATUAIS DA TENANT_METRICS
    console.log('\n📊 1. DADOS ATUAIS DA TENANT_METRICS:');
    const { data: tenantMetrics, error } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data, calculated_at')
      .eq('metric_type', 'billing_analysis')
      .limit(5);

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    console.log(`✅ Encontrados ${tenantMetrics?.length || 0} registros para validar`);

    // 2. VALIDAR CADA TENANT COM MÉTODO CORRETO
    for (let i = 0; i < Math.min(5, tenantMetrics?.length || 0); i++) {
      const tenant = tenantMetrics[i];
      const tenantId = tenant.tenant_id;
      const metricData = tenant.metric_data;
      const jobConversations = metricData?.total_conversations || 0;
      const calculatedAt = new Date(tenant.calculated_at);

      console.log(`\n🏢 TENANT ${i + 1}: ${metricData?.business_name || 'Unknown'}`);
      console.log(`   ID: ${tenantId}`);
      console.log(`   Conversas no job: ${jobConversations}`);
      console.log(`   Calculado em: ${calculatedAt.toLocaleString('pt-BR')}`);

      // 3. CALCULAR VALOR CORRETO - MÉTODO CORRETO (sessions únicas)
      console.log('\n   ✅ CALCULANDO VALOR CORRETO (SESSION_IDs únicos):');
      
      // Período exato do job
      const periodDays = metricData?.period_days || 30;
      const startDate = new Date(calculatedAt);
      startDate.setDate(startDate.getDate() - periodDays);

      console.log(`   Período: ${startDate.toLocaleString('pt-BR')} até ${calculatedAt.toLocaleString('pt-BR')}`);

      // Buscar sessions únicas com conversation_outcome para este tenant
      const { data: sessionData, error: sessError } = await supabase
        .from('conversation_history')
        .select('conversation_context, conversation_outcome, created_at')
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lt('created_at', calculatedAt.toISOString());

      if (sessError) {
        console.log(`   ❌ Erro ao buscar sessions: ${sessError.message}`);
        continue;
      }

      // Extrair session_ids únicos
      const uniqueSessions = new Set();
      const outcomesBySession = {};

      sessionData?.forEach(record => {
        const sessionId = record.conversation_context?.session_id;
        if (sessionId) {
          uniqueSessions.add(sessionId);
          if (!outcomesBySession[sessionId]) {
            outcomesBySession[sessionId] = [];
          }
          outcomesBySession[sessionId].push(record.conversation_outcome);
        }
      });

      const realConversationsCount = uniqueSessions.size;
      console.log(`   Sessions únicas: ${realConversationsCount}`);
      console.log(`   Mensagens com outcome: ${sessionData?.length || 0}`);

      // 4. COMPARAÇÃO
      const difference = jobConversations - realConversationsCount;
      const isCorrect = difference === 0;
      
      console.log(`\n   🔍 COMPARAÇÃO:`);
      console.log(`   Job: ${jobConversations} conversas`);
      console.log(`   Real: ${realConversationsCount} conversas (sessions únicas)`);
      console.log(`   Diferença: ${difference > 0 ? '+' : ''}${difference}`);
      console.log(`   Status: ${isCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);

      if (!isCorrect && realConversationsCount > 0) {
        console.log(`   Erro: ${((difference / realConversationsCount) * 100).toFixed(1)}%`);
      }

      // 5. DETALHES DAS SESSIONS (se incorreto)
      if (!isCorrect && uniqueSessions.size > 0) {
        console.log(`\n   📋 DETALHES DAS SESSIONS:`);
        let sessionCount = 0;
        for (const [sessionId, outcomes] of Object.entries(outcomesBySession)) {
          if (sessionCount >= 3) break; // Mostrar só primeiras 3
          console.log(`   Session ${sessionCount + 1}: ${sessionId.substring(0, 8)}... → [${outcomes.join(', ')}]`);
          sessionCount++;
        }

        // Mostrar outcome_distribution do job para comparar
        if (metricData?.outcome_distribution) {
          console.log(`\n   📊 OUTCOME_DISTRIBUTION NO JOB:`);
          const jobOutcomes = metricData.outcome_distribution;
          Object.entries(jobOutcomes).forEach(([outcome, count]) => {
            console.log(`   ${outcome}: ${count}`);
          });

          // Comparar com outcomes reais
          const realOutcomes = {};
          Object.values(outcomesBySession).forEach(outcomes => {
            outcomes.forEach(outcome => {
              realOutcomes[outcome] = (realOutcomes[outcome] || 0) + 1;
            });
          });

          console.log(`\n   📊 OUTCOMES REAIS:`);
          Object.entries(realOutcomes).forEach(([outcome, count]) => {
            console.log(`   ${outcome}: ${count}`);
          });
        }
      }

      console.log(`   ${'='.repeat(50)}`);
    }

    // 6. ANÁLISE GERAL
    console.log('\n📊 6. ANÁLISE GERAL:');
    let correctCount = 0;
    let totalValidated = 0;

    for (const tenant of tenantMetrics?.slice(0, 5) || []) {
      const tenantId = tenant.tenant_id;
      const jobConversations = tenant.metric_data?.total_conversations || 0;
      const calculatedAt = new Date(tenant.calculated_at);
      const periodDays = tenant.metric_data?.period_days || 30;
      const startDate = new Date(calculatedAt);
      startDate.setDate(startDate.getDate() - periodDays);

      const { data: sessionData } = await supabase
        .from('conversation_history')
        .select('conversation_context')
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lt('created_at', calculatedAt.toISOString());

      const uniqueSessions = new Set();
      sessionData?.forEach(record => {
        const sessionId = record.conversation_context?.session_id;
        if (sessionId) {
          uniqueSessions.add(sessionId);
        }
      });

      const realCount = uniqueSessions.size;
      
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
      console.log('   ✅ Job está contando sessions únicas corretamente.');
    } else {
      console.log('   ❌ MÉTRICA INCORRETA! Problemas identificados no cálculo.');
      console.log('\n   💡 POSSÍVEIS CAUSAS:');
      console.log('   1. Job não está contando sessions únicas');
      console.log('   2. Job está contando mensagens em vez de sessions');
      console.log('   3. Filtros de período ou tenant_id incorretos');
      console.log('   4. Problema na extração do session_id do conversation_context');
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🏢 VALIDAÇÃO TENANT MÉTRICA 1 CORRETA CONCLUÍDA - AGUARDANDO APROVAÇÃO');
}

validateTenantConversationsMetricCORRECT();