/**
 * VALIDAR CONVERSATION_TOKENS - TESTE REAL
 * Verificar se a soma está correta comparando com query manual
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function validarConversationTokens() {
  console.log('🧪 TESTE REAL: VALIDAÇÃO CONVERSATION_TOKENS');
  console.log('='.repeat(60));

  // Pegar um tenant com dados: Bella Vista
  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
  
  // Período de 30 dias
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  console.log(`🏢 Tenant: Bella Vista Spa & Salon`);
  console.log(`📅 Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}\n`);

  // 1. MÉTODO DO JOB (nossa implementação)
  console.log('🔍 MÉTODO 1: JOB IMPLEMENTATION');
  
  const { data: tokensData } = await supabase
    .from('conversation_history')
    .select('tokens_used, conversation_context')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null)
    .not('tokens_used', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  const sessionTokens = {};
  
  tokensData?.forEach(record => {
    const sessionId = record.conversation_context?.session_id;
    const tokens = record.tokens_used;
    
    if (sessionId && tokens && tokens > 0) {
      if (!sessionTokens[sessionId]) {
        sessionTokens[sessionId] = 0;
      }
      sessionTokens[sessionId] += tokens;
    }
  });
  
  const totalTokensJob = Object.values(sessionTokens).reduce((sum, tokens) => sum + tokens, 0);
  
  console.log(`   📊 Registros encontrados: ${tokensData?.length || 0}`);
  console.log(`   📊 Sessões únicas: ${Object.keys(sessionTokens).length}`);
  console.log(`   🤖 Total tokens (JOB): ${totalTokensJob}`);

  // 2. MÉTODO MANUAL DIRETO (verificação)
  console.log('\n🔍 MÉTODO 2: QUERY DIRETA (VERIFICAÇÃO)');
  
  const { data: allTokens } = await supabase
    .from('conversation_history')
    .select('tokens_used')
    .eq('tenant_id', tenantId)
    .not('tokens_used', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  const totalTokensDirect = allTokens?.reduce((sum, record) => sum + (record.tokens_used || 0), 0) || 0;
  
  console.log(`   📊 Registros com tokens: ${allTokens?.length || 0}`);
  console.log(`   🤖 Total tokens (DIRETO): ${totalTokensDirect}`);

  // 3. ANÁLISE DETALHADA POR SESSÃO
  console.log('\n🔍 ANÁLISE DETALHADA POR SESSÃO:');
  
  Object.entries(sessionTokens).slice(0, 5).forEach(([sessionId, tokens], i) => {
    console.log(`   ${i+1}. Sessão ${sessionId.substring(0, 8)}...: ${tokens} tokens`);
  });

  // 4. COMPARAÇÃO
  console.log('\n📊 COMPARAÇÃO DOS MÉTODOS:');
  console.log(`   🤖 JOB Implementation: ${totalTokensJob} tokens`);
  console.log(`   🤖 Query Direta: ${totalTokensDirect} tokens`);
  console.log(`   ✅ Diferença: ${Math.abs(totalTokensJob - totalTokensDirect)} tokens`);
  
  if (totalTokensJob === totalTokensDirect) {
    console.log(`   ✅ VALIDAÇÃO: CORRETO! Os métodos batem exatamente`);
  } else {
    console.log(`   ❌ VALIDAÇÃO: ERRO! Há diferença entre os métodos`);
    console.log(`   🔍 Nossa implementação pode estar somando por sessão quando deveria somar tudo`);
  }

  // 5. TESTE DE SESSÕES ESPECÍFICAS
  console.log('\n🔍 TESTE: ALGUMAS SESSÕES ESPECÍFICAS');
  
  const sessionsToTest = Object.keys(sessionTokens).slice(0, 3);
  
  for (const sessionId of sessionsToTest) {
    const { data: sessionData } = await supabase
      .from('conversation_history')
      .select('tokens_used, created_at')
      .eq('tenant_id', tenantId)
      .eq('conversation_context->>session_id', sessionId)
      .not('tokens_used', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    const manualSum = sessionData?.reduce((sum, record) => sum + (record.tokens_used || 0), 0) || 0;
    const jobSum = sessionTokens[sessionId];
    
    console.log(`   📍 Sessão ${sessionId.substring(0, 8)}...:`);
    console.log(`      - Mensagens: ${sessionData?.length || 0}`);
    console.log(`      - Job: ${jobSum} tokens`);
    console.log(`      - Manual: ${manualSum} tokens`);
    console.log(`      - ✅ ${jobSum === manualSum ? 'CORRETO' : 'ERRO'}`);
  }
}

validarConversationTokens();