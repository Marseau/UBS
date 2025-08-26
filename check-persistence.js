#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPersistence() {
  const TEST_RUN_ID = 'run_1756132833607';
  
  console.log(`🔍 Verificando persistência para TEST_RUN_ID: ${TEST_RUN_ID}`);
  
  // 1. Verificar conversations
  console.log('\n📋 1) Conversations:');
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .like('metadata', `%${TEST_RUN_ID}%`);
  
  if (convError) {
    console.error('Erro conversations:', convError);
  } else {
    console.log(`Total conversations: ${conversations?.length || 0}`);
    if (conversations?.length > 0) {
      conversations.slice(0, 3).forEach((c, i) => {
        console.log(`  ${i+1}. ID: ${c.id}, Outcome: ${c.conversation_outcome}, Metadata:`, JSON.stringify(c.metadata, null, 2));
      });
    }
  }
  
  // 2. Verificar messages
  console.log('\n💬 2) Messages:');
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .like('metadata', `%${TEST_RUN_ID}%`);
  
  if (msgError) {
    console.error('Erro messages:', msgError);
  } else {
    console.log(`Total messages: ${messages?.length || 0}`);
    if (messages?.length > 0) {
      messages.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i+1}. Content: "${m.content}", From User: ${m.is_from_user}, Created: ${m.created_at}`);
      });
    }
  }
  
  // 3. Verificar conversation_history (tabela antiga)
  console.log('\n📜 3) Conversation History (tabela antiga):');
  const { data: history, error: histError } = await supabase
    .from('conversation_history')
    .select('*')
    .like('metadata', `%${TEST_RUN_ID}%`);
  
  if (histError) {
    console.error('Erro conversation_history:', histError);
  } else {
    console.log(`Total conversation_history: ${history?.length || 0}`);
    if (history?.length > 0) {
      history.slice(0, 3).forEach((h, i) => {
        console.log(`  ${i+1}. Content: "${h.content}", Outcome: ${h.conversation_outcome}, Created: ${h.created_at}`);
      });
    }
  }
  
  // 4. Verificar appointments criados
  console.log('\n📅 4) Recent Appointments:');
  const tenantIds = [
    '33b8c488-5aa9-4891-b335-701d10296681',
    'fe1fbd26-16cf-4106-9be0-390bf8345304',
    'f34d8c94-f6cf-4dd7-82de-a3123b380cd8',
    'fe2fa876-05da-49b5-b266-8141bcd090fa'
  ];
  
  const { data: appointments, error: appError } = await supabase
    .from('appointments')
    .select('*')
    .in('tenant_id', tenantIds)
    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()); // últimas 2h
    
  if (appError) {
    console.error('Erro appointments:', appError);
  } else {
    console.log(`Total recent appointments: ${appointments?.length || 0}`);
    if (appointments?.length > 0) {
      appointments.slice(0, 3).forEach((a, i) => {
        console.log(`  ${i+1}. Tenant: ${a.tenant_id.slice(0,8)}, Service: ${a.service_name}, Status: ${a.status}`);
      });
    }
  }
}

checkPersistence().catch(console.error);