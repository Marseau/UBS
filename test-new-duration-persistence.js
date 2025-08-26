/**
 * Teste para verificar se novas conversas têm duration_minutes correto
 * Verifica apenas conversas criadas APÓS a correção
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNewDurationPersistence() {
  console.log('🧪 Testando persistência de duration_minutes após correção...\n');

  // Buscar conversas muito recentes (últimos 10 minutos)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('conversation_history')
    .select('id, created_at, conversation_context, is_from_user, session_id_uuid')
    .not('conversation_context', 'is', null)
    .gte('created_at', tenMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log('ℹ️ Nenhuma conversa muito recente encontrada.');
    console.log('💡 Para testar, envie algumas mensagens de teste via WhatsApp ou demo.');
    return;
  }

  console.log(`📊 Analisando ${data.length} conversas dos últimos 10 minutos:\n`);

  let correctCount = 0;
  let zeroCount = 0;

  data.forEach((row, index) => {
    const context = row.conversation_context;
    const duration = context?.duration_minutes;
    const messageType = row.is_from_user ? 'USER' : 'AI';
    
    console.log(`${index + 1}. ${messageType} | ${row.id.substring(0, 8)}...`);
    console.log(`   Session: ${row.session_id_uuid?.substring(0, 8)}...`);
    console.log(`   Duration: ${duration !== undefined ? duration : 'UNDEFINED'} min`);
    console.log(`   Created: ${new Date(row.created_at).toLocaleString()}`);
    
    if (duration > 0) {
      console.log(`   Status: ✅ DURAÇÃO CORRETA`);
      correctCount++;
    } else if (duration === 0) {
      console.log(`   Status: ⚠️ Ainda zero (pode ser primeira mensagem)`);
      zeroCount++;
    } else {
      console.log(`   Status: ❌ UNDEFINED`);
    }
    console.log('');
  });

  console.log('📈 RESUMO DOS TESTES:');
  console.log(`Total analisadas: ${data.length}`);
  console.log(`Duration > 0: ${correctCount}`);
  console.log(`Duration = 0: ${zeroCount} (primeira mensagem ou problema)`);
  console.log(`Duration UNDEFINED: ${data.length - correctCount - zeroCount}`);
  
  if (correctCount > 0) {
    console.log('\n🎉 SUCESSO! A correção está funcionando para novas mensagens!');
  } else if (zeroCount === data.length) {
    console.log('\n⚠️ Todas as durações são zero - pode ser normal se forem primeiras mensagens.');
  } else {
    console.log('\n❌ Possível problema na correção.');
  }
}

testNewDurationPersistence().catch(console.error);