const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verificarCorrections() {
  console.log('🔍 Verificando correções aplicadas...\n');

  try {
    // 1. Verificar persistence de outcomes nas últimas mensagens  
    const { data: messagesWithOutcomes, error: outcomesError } = await supabase
      .from('conversation_history')
      .select('id, session_id_uuid, message_order, sender, conversation_outcome, conversation_context')
      .not('conversation_outcome', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (outcomesError) {
      console.error('❌ Erro ao buscar outcomes:', outcomesError);
      return;
    }

    console.log('📝 Últimas mensagens com outcomes:');
    for (const msg of (messagesWithOutcomes || [])) {
      const context = msg.conversation_context || {};
      const durationMinutes = context.duration_minutes || 0;
      
      console.log(`- Session: ${msg.session_id_uuid?.substring(0, 8)}... | Order: ${msg.message_order} | Sender: ${msg.sender} | Outcome: ${msg.conversation_outcome} | Duration: ${durationMinutes}min`);
    }

    console.log('\n🔍 Verificando se são realmente as últimas mensagens das conversas...');
    
    // 2. Para cada sessão com outcome, verificar se é a última mensagem
    for (const msg of (messagesWithOutcomes || []).slice(0, 3)) {
      const { data: maxOrder } = await supabase
        .from('conversation_history')
        .select('message_order')
        .eq('session_id_uuid', msg.session_id_uuid)
        .order('message_order', { ascending: false })
        .limit(1);

      const isLastMessage = maxOrder[0]?.message_order === msg.message_order;
      console.log(`- Session ${msg.session_id_uuid?.substring(0, 8)}: Outcome na ordem ${msg.message_order}, última mensagem: ${maxOrder[0]?.message_order} | ✓ É última: ${isLastMessage ? '✅' : '❌'}`);
    }

    console.log('\n🕐 Verificando duration_minutes em conversas recentes:');
    
    // 3. Verificar duration_minutes em conversas recentes
    const { data: recentConversations } = await supabase
      .from('conversation_history')
      .select('session_id_uuid, conversation_context')
      .not('conversation_context', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const uniqueSessions = [...new Set((recentConversations || []).map(c => c.session_id_uuid))].slice(0, 5);
    
    for (const sessionId of uniqueSessions) {
      const sessionMessages = (recentConversations || []).filter(c => c.session_id_uuid === sessionId);
      const lastMessage = sessionMessages[0];
      const context = lastMessage?.conversation_context || {};
      const duration = context.duration_minutes || 0;
      
      console.log(`- Session ${sessionId?.substring(0, 8)}: duration_minutes = ${duration} | ✓ ${duration > 0 ? '✅ OK' : '❌ Zero'}`);
    }

    console.log('\n✅ Verificação completada!');
    
  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  }
}

verificarCorrections();