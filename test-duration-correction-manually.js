/**
 * Teste manual para verificar correção duration_minutes
 * Cria conversas com tempo controlado simulando timestamps reais
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createManualTestConversation() {
  console.log('🧪 Criando conversa manual para testar duration_minutes...\n');

  const sessionId = 'bd786c99-84b7-4fa5-8f3d-4166480822af';
  const tenantId = 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8'; // Healthcare tenant
  const userId = '+5511999999999';

  // Simular timestamps com intervalos reais
  const baseTime = new Date('2025-08-26T15:00:00.000Z'); // 15:00
  const timestamps = [
    baseTime.getTime(),                    // 15:00:00 - Primeira mensagem
    baseTime.getTime() + (2 * 60 * 1000), // 15:02:00 - +2min
    baseTime.getTime() + (5 * 60 * 1000), // 15:05:00 - +5min
    baseTime.getTime() + (8 * 60 * 1000), // 15:08:00 - +8min
  ];

  const messages = [
    { content: 'Olá, preciso marcar uma consulta', isFromUser: true },
    { content: 'Claro! Qual especialidade você precisa?', isFromUser: false },
    { content: 'Cardiologia, por favor', isFromUser: true },
    { content: 'Perfeito! Vou verificar os horários disponíveis.', isFromUser: false }
  ];

  console.log('📋 Inserindo mensagens com timestamps controlados:');
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const timestamp = timestamps[i];
    const startTime = timestamps[0]; // Primeira mensagem como início
    const durationMinutes = Math.floor((timestamp - startTime) / 60000);
    
    console.log(`${i + 1}. ${msg.isFromUser ? 'USER' : 'AI'}: "${msg.content}"`);
    console.log(`   Timestamp: ${new Date(timestamp).toLocaleString()}`);
    console.log(`   Duration: ${durationMinutes} min`);
    
    const { data, error } = await supabase
      .from('conversation_history')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        session_id_uuid: sessionId,
        content: msg.content,
        is_from_user: msg.isFromUser,
        message_type: 'text',
        message_source: 'manual_test',
        conversation_outcome: null,
        conversation_context: {
          session_id: sessionId,
          duration_minutes: durationMinutes,
          test_mode: true,
          manual_timestamp: new Date(timestamp).toISOString()
        },
        created_at: new Date(timestamp).toISOString()
      });

    if (error) {
      console.error(`❌ Erro ao inserir mensagem ${i + 1}:`, error.message);
      return;
    }
    
    console.log(`   ✅ Inserida: ${data[0]?.id?.substring(0, 8)}...`);
    console.log('');
  }

  console.log('🎉 Conversa manual criada com sucesso!');
  console.log(`📊 Session ID: ${sessionId}`);
  console.log('\n🔍 Verificando dados inseridos...');

  // Verificar os dados inseridos
  const { data: verification, error: verifyError } = await supabase
    .from('conversation_history')
    .select('*')
    .eq('session_id_uuid', sessionId)
    .order('created_at', { ascending: true });

  if (verifyError) {
    console.error('❌ Erro na verificação:', verifyError.message);
    return;
  }

  console.log('\n📈 RESULTADOS DA VERIFICAÇÃO:');
  verification.forEach((row, index) => {
    const ctx = row.conversation_context || {};
    const messageType = row.is_from_user ? 'USER' : 'AI';
    
    console.log(`${index + 1}. ${messageType} | Duration: ${ctx.duration_minutes}min`);
    console.log(`   Created: ${new Date(row.created_at).toLocaleString()}`);
    console.log(`   Content: "${row.content}"`);
  });

  console.log('\n✅ TESTE MANUAL CONCLUÍDO!');
  console.log('📊 Resultado esperado:');
  console.log('   Mensagem 1: 0min, Mensagem 2: 2min, Mensagem 3: 5min, Mensagem 4: 8min');
  
  return sessionId;
}

createManualTestConversation().catch(console.error);