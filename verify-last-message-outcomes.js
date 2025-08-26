const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyLastMessageOutcomes() {
  console.log('🔍 Verificando se os outcomes estão na ÚLTIMA mensagem de cada conversa...\n');

  // Buscar conversas com outcomes
  const { data: conversationsWithOutcomes, error } = await supabase
    .from('conversation_history')
    .select('session_id_uuid, id, is_from_user, conversation_outcome, created_at, content')
    .not('conversation_outcome', 'is', null)
    .order('session_id_uuid', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Erro ao buscar conversas:', error.message);
    return;
  }

  const sessionGroups = {};
  conversationsWithOutcomes.forEach(msg => {
    if (!sessionGroups[msg.session_id_uuid]) {
      sessionGroups[msg.session_id_uuid] = [];
    }
    sessionGroups[msg.session_id_uuid].push(msg);
  });

  for (const sessionId of Object.keys(sessionGroups)) {
    // Buscar TODAS as mensagens da sessão
    const { data: allMessages } = await supabase
      .from('conversation_history')
      .select('id, is_from_user, conversation_outcome, created_at')
      .eq('session_id_uuid', sessionId)
      .order('created_at', { ascending: true });

    const lastMessage = allMessages[allMessages.length - 1];
    const messageWithOutcome = allMessages.find(msg => msg.conversation_outcome);

    const isCorrect = lastMessage.id === messageWithOutcome.id;
    const status = isCorrect ? '✅' : '❌';
    
    console.log(`${status} Sessão: ${sessionId.substring(0, 8)}...`);
    console.log(`   Outcome: ${messageWithOutcome.conversation_outcome}`);
    console.log(`   Última mensagem: ${lastMessage.is_from_user ? 'USUÁRIO' : 'AI'} (${lastMessage.id.substring(0, 8)}...)`);
    console.log(`   Msg com outcome: ${messageWithOutcome.is_from_user ? 'USUÁRIO' : 'AI'} (${messageWithOutcome.id.substring(0, 8)}...)`);
    console.log(`   Correto: ${isCorrect ? 'SIM' : 'NÃO'}\n`);
  }
}

verifyLastMessageOutcomes().catch(console.error);