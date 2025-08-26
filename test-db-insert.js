#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDbInsert() {
  console.log('🔍 Testando inserção direta no conversation_history...');
  
  // Buscar um user_id real primeiro
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id')
    .limit(1);
    
  if (userError || !users?.length) {
    console.error('❌ Erro ao buscar usuários:', userError);
    return;
  }
  
  const userId = users[0].id;
  console.log(`✅ User ID encontrado: ${userId}`);
  
  // Dados de teste (simulando exatamente o que a rota demo está tentando inserir)
  const sessionUuid = crypto.randomUUID(); // Gerar UUID válido para session_id_uuid
  
  const conversationData = {
    tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
    user_id: userId,
    content: 'Teste manual debug',
    is_from_user: true,
    message_type: 'text', // Corrigido para 'text'
    intent_detected: null, // Pode ser null
    confidence_score: null, // Pode ser null
    conversation_context: {
      session_id: `session_${Date.now()}`,
      duration_minutes: 5,
      test: {
        test_run_id: 'manual_debug',
        domain: 'beauty',
        expected_outcome: 'test_message'
      }
    },
    message_source: 'whatsapp_demo',
    model_used: 'gpt-4',
    tokens_used: 150,
    api_cost_usd: 0.003,
    processing_cost_usd: 0.001,
    conversation_outcome: 'test_message', // Usar outcome válido
    // session_id_uuid é coluna gerada automaticamente - não inserir
    created_at: new Date().toISOString()
  };
  
  console.log('\n💬 Tentando inserir dados:');
  console.log(JSON.stringify(conversationData, null, 2));
  
  const { data, error } = await supabase
    .from('conversation_history')
    .insert([conversationData]);
  
  if (error) {
    console.error('\n❌ ERRO COMPLETO na inserção:');
    console.error(JSON.stringify(error, null, 2));
  } else {
    console.log('\n✅ Inserção bem-sucedida!');
    console.log('Data returned:', data);
    
    // Verificar se foi realmente inserido
    const { data: inserted } = await supabase
      .from('conversation_history')
      .select('*')
      .eq('content', 'Teste manual debug')
      .order('created_at', { ascending: false })
      .limit(1);
      
    console.log('✅ Dados inseridos confirmados:', inserted?.length);
  }
}

testDbInsert().catch(console.error);