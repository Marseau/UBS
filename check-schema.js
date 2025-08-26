#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('🔍 Verificando estrutura das tabelas...');
  
  // Listar todas as tabelas
  const { data: tables, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name');
  
  if (error) {
    console.error('Erro listando tabelas:', error);
    return;
  }
  
  console.log('\n📋 Tabelas existentes:');
  tables.forEach(t => console.log(`  - ${t.table_name}`));
  
  // Verificar estrutura da tabela conversation_history
  console.log('\n📜 Estrutura da conversation_history:');
  const { data: columns, error: colError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_schema', 'public')
    .eq('table_name', 'conversation_history')
    .order('ordinal_position');
    
  if (colError) {
    console.error('Erro:', colError);
  } else {
    columns.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));
  }
  
  // Verificar dados recentes na conversation_history
  console.log('\n💬 Dados recentes conversation_history (últimas 10):');
  const { data: recent, error: recentError } = await supabase
    .from('conversation_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (recentError) {
    console.error('Erro:', recentError);
  } else {
    console.log(`Total registros recentes: ${recent?.length || 0}`);
    recent?.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i+1}. ID: ${r.id}, Content: "${r.content?.slice(0,50)}...", User: ${r.is_from_user}, Created: ${r.created_at}`);
    });
  }
}

checkSchema().catch(console.error);