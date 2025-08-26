/**
 * Debug específico para uma conversa recente
 * Verifica se o timestamp está sendo processado corretamente
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugConversationDetail() {
  console.log('🔍 Debug detalhado de uma sessão recente...\n');

  // Buscar uma sessão recente específica
  const { data, error } = await supabase
    .from('conversation_history')
    .select('*')
    .eq('session_id_uuid', '0baf8904-70fc-4fa1-a6fb-6dd89dc35e13') // Sessão do teste
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log('❌ Sessão não encontrada');
    return;
  }

  console.log(`📊 Analisando sessão: ${data[0].session_id_uuid}`);
  console.log(`💬 Total de mensagens: ${data.length}\n`);

  data.forEach((row, index) => {
    const context = row.conversation_context || {};
    const messageType = row.is_from_user ? 'USER' : 'AI';
    
    console.log(`${index + 1}. ${messageType} | ${row.id.substring(0, 8)}...`);
    console.log(`   Content: "${row.content.substring(0, 50)}..."`);
    console.log(`   Created: ${row.created_at}`);
    console.log(`   Duration: ${context.duration_minutes || 'UNDEFINED'} min`);
    console.log(`   Context keys: ${Object.keys(context).join(', ')}`);
    
    if (index === 0) {
      console.log(`   🔍 PRIMEIRA MENSAGEM - Context completo:`);
      console.log(`   ${JSON.stringify(context, null, 4)}`);
    }
    console.log('');
  });

  // Calcular duração esperada
  const firstMessage = data[0];
  const lastMessage = data[data.length - 1];
  const startTime = new Date(firstMessage.created_at);
  const endTime = new Date(lastMessage.created_at);
  const expectedDuration = Math.floor((endTime - startTime) / 60000);
  
  console.log(`⏱️ DURAÇÃO CALCULADA MANUALMENTE:`);
  console.log(`   Início: ${startTime.toLocaleString()}`);
  console.log(`   Fim: ${endTime.toLocaleString()}`);
  console.log(`   Duração esperada: ${expectedDuration} min`);
  console.log(`   Duração no contexto: ${firstMessage.conversation_context?.duration_minutes || 'N/A'} min`);
}

debugConversationDetail().catch(console.error);