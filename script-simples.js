#!/usr/bin/env node

/**
 * SCRIPT PARA VERIFICAR TABELAS EXISTENTES
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU'
);

async function checkTables() {
  console.log('🔍 VERIFICANDO TABELAS EXISTENTES');
  console.log('='.repeat(40));
  
  try {
    // Tentar acessar diferentes tabelas para ver quais existem
    const tables = [
      'ai_interactions',
      'ai_conversations', 
      'conversations',
      'chat_messages',
      'subscriptions',
      'payments',
      'billing'
    ];
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`❌ ${table}: ${error.message}`);
        } else {
          console.log(`✅ ${table}: Existe`);
        }
      } catch (err) {
        console.log(`❌ ${table}: ${err.message}`);
      }
    }
    
    // Verificar se há outras tabelas relacionadas a AI
    console.log('\n🔍 Verificando tabelas com "ai" no nome...');
    
    // Tentar algumas variações
    const aiTables = [
      'ai_interaction',
      'ai_conversation',
      'ai_message',
      'ai_chat'
    ];
    
    for (const table of aiTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`❌ ${table}: ${error.message}`);
        } else {
          console.log(`✅ ${table}: Existe`);
        }
      } catch (err) {
        console.log(`❌ ${table}: ${err.message}`);
      }
    }
    
  } catch (error) {
    console.log('❌ Erro geral:', error.message);
  }
}

checkTables();