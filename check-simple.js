#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSimple() {
  console.log('🔍 Verificando dados na conversation_history...');
  
  // Verificar dados recentes
  const { data: recent, error } = await supabase
    .from('conversation_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error('Erro:', error);
    return;
  }
  
  console.log(`\n💬 Total registros recentes: ${recent?.length || 0}`);
  
  if (recent?.length > 0) {
    console.log('\nPrimeiros registros:');
    recent.forEach((r, i) => {
      console.log(`\n${i+1}. ID: ${r.id}`);
      console.log(`   Content: "${r.content?.slice(0,100)}${r.content?.length > 100 ? '...' : ''}"`);
      console.log(`   From User: ${r.is_from_user}`);
      console.log(`   Tenant: ${r.tenant_id?.slice(0,8)}`);
      console.log(`   Created: ${r.created_at}`);
      console.log(`   Campos disponíveis:`, Object.keys(r));
    });
  } else {
    console.log('❌ Nenhum registro encontrado na conversation_history');
  }
}

checkSimple().catch(console.error);