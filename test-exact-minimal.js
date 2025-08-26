#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testExactMinimal() {
  console.log('🔍 Testando com conversation_context como a rota usa...');
  
  // Buscar um user_id real primeiro
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id')
    .limit(1);
    
  const userId = users[0].id;
  console.log(`✅ User ID encontrado: ${userId}`);
  
  // Testar com conversation_context (JSON)
  const testData = {
    tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
    user_id: userId,
    content: 'Teste com context',
    is_from_user: true,
    conversation_context: {
      domain: 'beauty',
      demo_mode: true,
      test: {
        test_run_id: 'final_test',
        domain: 'beauty'
      }
    },
    conversation_outcome: 'test_message'
  };
  
  console.log('\n💬 Tentando inserir com conversation_context:');
  console.log(JSON.stringify(testData, null, 2));
  
  const { data, error } = await supabase
    .from('conversation_history')
    .insert([testData]);
  
  if (error) {
    console.error('\n❌ ERRO:');
    console.error(JSON.stringify(error, null, 2));
  } else {
    console.log('\n✅ Sucesso!');
  }
}

testExactMinimal().catch(console.error);