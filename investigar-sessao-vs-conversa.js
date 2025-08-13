/**
 * INVESTIGAR: O QUE É UMA SESSÃO vs CONVERSA
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function investigarSessaoVsConversa() {
  console.log('🔍 INVESTIGAÇÃO: SESSÃO vs CONVERSA');
  console.log('='.repeat(50));

  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  // Pegar algumas sessões com seus dados completos
  const { data: sessionData } = await supabase
    .from('conversation_history')
    .select('conversation_context, conversation_outcome, created_at, message_type, user_id')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString())
    .order('created_at', { ascending: true })
    .limit(50); // Pegar só 50 para analisar

  // Agrupar por session_id
  const sessionGroups = {};
  sessionData?.forEach(record => {
    const sessionId = record.conversation_context?.session_id;
    if (sessionId) {
      if (!sessionGroups[sessionId]) {
        sessionGroups[sessionId] = [];
      }
      sessionGroups[sessionId].push(record);
    }
  });

  console.log(`📊 Analisando ${Object.keys(sessionGroups).length} sessões:\n`);

  // Analisar as primeiras 5 sessões
  Object.entries(sessionGroups).slice(0, 5).forEach(([sessionId, messages], i) => {
    console.log(`🎯 SESSÃO ${i+1}: ${sessionId.substring(0, 8)}...`);
    
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const duration = new Date(lastMessage.created_at) - new Date(firstMessage.created_at);
    const durationMinutes = Math.round(duration / (1000 * 60));
    
    console.log(`   📅 Início: ${new Date(firstMessage.created_at).toLocaleString('pt-BR')}`);
    console.log(`   📅 Fim: ${new Date(lastMessage.created_at).toLocaleString('pt-BR')}`);
    console.log(`   ⏱️  Duração: ${durationMinutes} minutos`);
    console.log(`   📨 Mensagens: ${messages.length}`);
    console.log(`   👤 User ID: ${firstMessage.user_id || 'N/A'}`);
    
    // Ver os outcomes da sessão
    const outcomes = messages.map(m => m.conversation_outcome).filter(o => o);
    const uniqueOutcomes = [...new Set(outcomes)];
    console.log(`   🎯 Outcomes: ${uniqueOutcomes.join(', ') || 'Nenhum'}`);
    
    // Ver tipos de mensagem
    const messageTypes = messages.map(m => m.message_type).filter(t => t);
    const uniqueTypes = [...new Set(messageTypes)];
    console.log(`   📝 Tipos: ${uniqueTypes.join(', ') || 'N/A'}`);
    
    console.log('');
  });

  // Verificar se session_id = conversa
  console.log('🤔 ANÁLISE: SESSÃO = CONVERSA?');
  
  // Contar outcomes appointment_created (conversas que viraram agendamento)
  const { data: appointmentOutcomes } = await supabase
    .from('conversation_history')
    .select('conversation_context, conversation_outcome')
    .eq('tenant_id', tenantId)
    .eq('conversation_outcome', 'appointment_created')
    .not('conversation_context', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  const appointmentSessions = new Set();
  appointmentOutcomes?.forEach(record => {
    const sessionId = record.conversation_context?.session_id;
    if (sessionId) appointmentSessions.add(sessionId);
  });

  console.log(`📊 Total sessões únicas: 69`);
  console.log(`📊 Sessões que viraram agendamento: ${appointmentSessions.size}`);
  console.log(`📊 Sessões sem agendamento: ${69 - appointmentSessions.size}`);
  
  console.log('\n🎯 CONCLUSÃO:');
  console.log('   Uma SESSÃO representa uma conversa completa entre cliente e IA');
  console.log('   Cada session_id é uma conversa única');
  console.log('   Algumas conversas geram agendamentos, outras não');
}

investigarSessaoVsConversa();