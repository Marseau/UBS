const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verificarCorrections() {
  console.log('🔍 Verificação Final das Correções\n');

  try {
    // 1. Verificar últimas mensagens com outcomes
    console.log('📋 1. Últimas mensagens com conversation_outcome:');
    const { data: messagesWithOutcomes } = await supabase
      .from('conversation_history')
      .select('id, session_id_uuid, content, is_from_user, conversation_outcome, conversation_context, created_at')
      .not('conversation_outcome', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8);

    for (const msg of (messagesWithOutcomes || [])) {
      const context = msg.conversation_context || {};
      const duration = context.duration_minutes || 0;
      const sender = msg.is_from_user ? 'User' : 'AI';
      
      console.log(`   • ${msg.session_id_uuid?.substring(0, 8)} | ${sender} | Outcome: ${msg.conversation_outcome} | Duration: ${duration}min`);
      console.log(`     Content: "${msg.content?.substring(0, 50)}..."`);
    }

    console.log('\n🎯 2. Verificando se outcomes estão nas últimas mensagens das conversas:');
    
    // 2. Para algumas sessões, verificar se o outcome está na última mensagem
    const uniqueSessions = [...new Set((messagesWithOutcomes || []).map(m => m.session_id_uuid))].slice(0, 3);
    
    for (const sessionId of uniqueSessions) {
      // Buscar todas as mensagens da sessão
      const { data: sessionMessages } = await supabase
        .from('conversation_history')
        .select('id, is_from_user, conversation_outcome, created_at')
        .eq('session_id_uuid', sessionId)
        .order('created_at', { ascending: true });

      const lastMessage = sessionMessages[sessionMessages.length - 1];
      const hasOutcome = lastMessage?.conversation_outcome ? '✅' : '❌';
      const lastSender = lastMessage?.is_from_user ? 'User' : 'AI';
      
      console.log(`   • Session ${sessionId?.substring(0, 8)}: ${sessionMessages.length} msgs | Última: ${lastSender} | Outcome: ${hasOutcome}`);
    }

    console.log('\n📊 3. Verificando duration_minutes nas conversas recentes:');
    
    // 3. Verificar duration_minutes 
    const { data: recentContexts } = await supabase
      .from('conversation_history')
      .select('session_id_uuid, conversation_context')
      .not('conversation_context', 'is', null)
      .order('created_at', { ascending: false })
      .limit(15);

    const sessionDurations = {};
    for (const msg of (recentContexts || [])) {
      const context = msg.conversation_context || {};
      const duration = context.duration_minutes || 0;
      if (!sessionDurations[msg.session_id_uuid] && duration > 0) {
        sessionDurations[msg.session_id_uuid] = duration;
      }
    }

    Object.entries(sessionDurations).slice(0, 5).forEach(([sessionId, duration]) => {
      const status = duration > 0 ? '✅' : '❌';
      console.log(`   • Session ${sessionId?.substring(0, 8)}: ${duration} minutos ${status}`);
    });

    console.log('\n✅ Verificação completada! Resultados:');
    console.log(`   - Mensagens com outcomes encontradas: ${(messagesWithOutcomes || []).length}`);
    console.log(`   - Sessions com duration > 0: ${Object.keys(sessionDurations).length}`);
    
    // Verificação extra: outcomes por tipo
    const outcomeTypes = {};
    (messagesWithOutcomes || []).forEach(msg => {
      outcomeTypes[msg.conversation_outcome] = (outcomeTypes[msg.conversation_outcome] || 0) + 1;
    });
    
    console.log('\n📈 Tipos de outcomes encontrados:');
    Object.entries(outcomeTypes).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  }
}

verificarCorrections();