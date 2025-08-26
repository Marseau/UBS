/**
 * Debug de qualquer conversa recente
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugAnyRecentConversation() {
  console.log('🔍 Debug de conversas recentes...\n');

  // Buscar última sessão
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data: recent, error } = await supabase
    .from('conversation_history')
    .select('session_id_uuid')
    .gte('created_at', tenMinutesAgo)
    .limit(1);

  if (error || !recent || recent.length === 0) {
    console.log('❌ Nenhuma conversa recente encontrada');
    return;
  }

  const sessionId = recent[0].session_id_uuid;
  console.log(`🎯 Analisando sessão: ${sessionId}\n`);

  // Buscar todas as mensagens da sessão
  const { data, error: sessionError } = await supabase
    .from('conversation_history')
    .select('*')
    .eq('session_id_uuid', sessionId)
    .order('created_at', { ascending: true });

  if (sessionError || !data) {
    console.error('❌ Erro ao buscar mensagens:', sessionError?.message);
    return;
  }

  console.log(`💬 Total de mensagens: ${data.length}\n`);

  data.forEach((row, index) => {
    const context = row.conversation_context || {};
    const messageType = row.is_from_user ? 'USER' : 'AI';
    const createdAt = new Date(row.created_at);
    
    console.log(`${index + 1}. ${messageType} | ${row.id.substring(0, 8)}...`);
    console.log(`   Content: "${row.content.substring(0, 50)}..."`);
    console.log(`   Created: ${createdAt.toLocaleString()}`);
    console.log(`   Duration ctx: ${context.duration_minutes !== undefined ? context.duration_minutes : 'UNDEFINED'} min`);
    console.log(`   Message source: ${row.message_source || 'N/A'}`);
    
    if (index === 0) {
      console.log(`   🔍 PRIMEIRA MENSAGEM - Context completo:`);
      console.log(JSON.stringify(context, null, 4));
    }
    console.log('');
  });

  // Calcular duração esperada baseada nos created_at
  const firstMessage = data[0];
  const lastMessage = data[data.length - 1];
  const startTime = new Date(firstMessage.created_at);
  const endTime = new Date(lastMessage.created_at);
  const actualDuration = Math.floor((endTime - startTime) / 60000);
  
  console.log(`⏱️ ANÁLISE DE DURAÇÃO:`);
  console.log(`   Início conversa: ${startTime.toLocaleString()}`);
  console.log(`   Última mensagem: ${endTime.toLocaleString()}`);
  console.log(`   Duração real: ${actualDuration} min`);
  console.log(`   Duração no ctx: ${firstMessage.conversation_context?.duration_minutes || 'N/A'} min`);
  
  // Verificar se é modo demo
  if (data.some(row => row.message_source === 'whatsapp_demo')) {
    console.log('\n🎭 MODO DEMO DETECTADO - Pode afetar timestamp!');
  }
}

debugAnyRecentConversation().catch(console.error);