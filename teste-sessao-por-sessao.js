/**
 * TESTE SESSÃO POR SESSÃO
 * Refazer lógica 1 em 1 igual conversas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testeSessaoPorSessao() {
  console.log('🧪 TESTE SESSÃO POR SESSÃO - LÓGICA 1 EM 1');
  console.log('='.repeat(60));

  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681'; // Bella Vista
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  console.log(`🏢 Tenant: Bella Vista Spa & Salon`);

  // Buscar dados
  const { data: conversationData } = await supabase
    .from('conversation_history')
    .select('conversation_context')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  console.log(`📊 Total registros: ${conversationData?.length || 0}`);

  // MÉTODO 1: CONVERSAS (atual - que está correto)
  console.log('\n🔍 MÉTODO 1: CONVERSAS (sessões únicas)');
  const uniqueSessionsConversas = new Set();
  conversationData?.forEach(record => {
    const sessionId = record.conversation_context?.session_id;
    if (sessionId) {
      uniqueSessionsConversas.add(sessionId);
    }
  });
  console.log(`   Sessões únicas encontradas: ${uniqueSessionsConversas.size}`);

  // MÉTODO 2: MINUTOS (atual - que você disse estar errado)
  console.log('\n🔍 MÉTODO 2: MINUTOS (somar por sessão única)');
  const sessionMinutes = {};
  conversationData?.forEach(record => {
    const context = record.conversation_context;
    if (context?.session_id && context?.duration_minutes && context.duration_minutes > 0) {
      if (!sessionMinutes[context.session_id]) {
        sessionMinutes[context.session_id] = 0;
      }
      sessionMinutes[context.session_id] += context.duration_minutes;
    }
  });
  
  const totalMinutos = Object.values(sessionMinutes).reduce((sum, minutes) => sum + minutes, 0);
  const sessoesComMinutos = Object.keys(sessionMinutes).length;
  
  console.log(`   Sessões com minutos: ${sessoesComMinutos}`);
  console.log(`   Total minutos: ${totalMinutos}`);

  // COMPARAÇÃO
  console.log('\n📊 COMPARAÇÃO:');
  console.log(`   Sessões para conversas: ${uniqueSessionsConversas.size}`);
  console.log(`   Sessões para minutos: ${sessoesComMinutos}`);
  console.log(`   Diferença: ${uniqueSessionsConversas.size - sessoesComMinutos}`);

  if (uniqueSessionsConversas.size !== sessoesComMinutos) {
    console.log('\n🚨 PROBLEMA ENCONTRADO: Número de sessões diferente!');
    
    // Encontrar sessões que têm conversation_context mas não têm duration_minutes
    const sessoesConversas = Array.from(uniqueSessionsConversas);
    const sessoesMinutos = Object.keys(sessionMinutes);
    
    const sessoesSemMinutos = sessoesConversas.filter(id => !sessoesMinutos.includes(id));
    console.log(`\n📋 SESSÕES SEM DURATION_MINUTES (${sessoesSemMinutos.length}):`);
    
    // Buscar registros dessas sessões sem minutos
    for (let i = 0; i < Math.min(3, sessoesSemMinutos.length); i++) {
      const sessionId = sessoesSemMinutos[i];
      const exemplos = conversationData?.filter(record => 
        record.conversation_context?.session_id === sessionId
      );
      
      console.log(`\n   Sessão ${i + 1}: ${sessionId}`);
      console.log(`   Registros: ${exemplos?.length || 0}`);
      if (exemplos && exemplos.length > 0) {
        const ctx = exemplos[0].conversation_context;
        console.log(`   Context keys: [${Object.keys(ctx || {}).join(', ')}]`);
        console.log(`   Duration minutes: ${ctx?.duration_minutes || 'AUSENTE'}`);
      }
    }
  }

  // MÉTODO 3: NOVA PROPOSTA - SÓ CONTAR SESSÕES QUE TÊM DURATION_MINUTES
  console.log('\n🔍 MÉTODO 3: NOVA PROPOSTA');
  console.log('   Se o problema são sessões sem duration_minutes:');
  console.log(`   - Conversas (todas sessões): ${uniqueSessionsConversas.size}`);
  console.log(`   - Minutos (só sessões com duration): ${sessoesComMinutos}`);
  console.log(`   - Total minutos: ${totalMinutos}`);
}

testeSessaoPorSessao();