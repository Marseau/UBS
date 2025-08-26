#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTestPersistence() {
  const TEST_RUN_ID = 'run_1756133124835'; // From the running test
  
  console.log(`🔍 Verificando persistência para TEST_RUN_ID: ${TEST_RUN_ID}`);
  
  // Buscar dados recentes primeiro
  const { data: results, error } = await supabase
    .from('conversation_history')
    .select('*')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // últimos 10 min
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('❌ Erro na query:', error);
    return;
  }
  
  console.log(`\n✅ Total registros encontrados: ${results?.length || 0}`);
  
  if (results?.length > 0) {
    console.log('\n📋 Primeiros registros:');
    results.forEach((r, i) => {
      console.log(`\n${i+1}. ID: ${r.id}`);
      console.log(`   Content: "${r.content?.slice(0,60)}..."`);
      console.log(`   From User: ${r.is_from_user}`);
      console.log(`   Tenant: ${r.tenant_id?.slice(0,8)}`);
      console.log(`   Outcome: ${r.conversation_outcome}`);
      console.log(`   Context:`, JSON.stringify(r.conversation_context, null, 2));
      console.log(`   Created: ${r.created_at}`);
    });
    
    // Query de acurácia por domínio
    console.log(`\n🎯 ACURÁCIA POR DOMÍNIO:`);
    const domains = [...new Set(results.map(r => r.conversation_context?.test?.domain).filter(Boolean))];
    for (const domain of domains) {
      const domainRecords = results.filter(r => r.conversation_context?.test?.domain === domain);
      const expected = domainRecords.map(r => r.conversation_context?.test?.expected_outcome);
      const predicted = domainRecords.map(r => r.conversation_outcome);
      console.log(`\n  ${domain.toUpperCase()}:`);
      console.log(`    Records: ${domainRecords.length}`);
      console.log(`    Expected outcomes: ${[...new Set(expected)].join(', ')}`);
      console.log(`    Predicted outcomes: ${[...new Set(predicted)].join(', ')}`);
    }
  } else {
    console.log('\n❌ Nenhum registro encontrado com esse TEST_RUN_ID!');
    
    // Verificar se tem dados recentes
    const { data: recent } = await supabase
      .from('conversation_history')
      .select('conversation_context, created_at')
      .order('created_at', { ascending: false })
      .limit(3);
      
    console.log('\n🔍 Últimos 3 registros na tabela:');
    recent?.forEach((r, i) => {
      console.log(`  ${i+1}. Context:`, JSON.stringify(r.conversation_context, null, 2));
      console.log(`     Created: ${r.created_at}`);
    });
  }
}

checkTestPersistence().catch(console.error);