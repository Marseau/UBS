const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDurationMinutes() {
  console.log('🔍 Verificando duration_minutes nas últimas conversas...\n');

  const { data, error } = await supabase
    .from('conversation_history')
    .select('id, created_at, conversation_context, is_from_user, session_id_uuid')
    .not('conversation_context', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }

  console.log('📊 Análise das últimas 30 conversas com conversation_context:');
  console.log('========================================================\n');

  let zeroCount = 0;
  let nonZeroCount = 0;
  let undefinedCount = 0;

  data.forEach((row, index) => {
    const context = row.conversation_context;
    const duration = context?.duration_minutes;
    const hasFlowLock = !!context?.flow_lock;
    const messageType = row.is_from_user ? 'USER' : 'AI';
    
    console.log(`${index + 1}. ${messageType} | ${row.id.substring(0, 8)}... | Session: ${row.session_id_uuid?.substring(0, 8)}...`);
    console.log(`   Duration: ${duration !== undefined ? duration : 'UNDEFINED'}`);
    console.log(`   Flow Lock: ${hasFlowLock ? 'YES' : 'NO'}`);
    console.log(`   Created: ${new Date(row.created_at).toLocaleString()}`);
    console.log('');

    // Contar estatísticas
    if (duration === undefined) {
      undefinedCount++;
    } else if (duration === 0) {
      zeroCount++;
    } else {
      nonZeroCount++;
    }
  });

  console.log('📈 ESTATÍSTICAS DURATION_MINUTES:');
  console.log(`Total analisadas: ${data.length}`);
  console.log(`Duration = 0: ${zeroCount} (${(zeroCount/data.length*100).toFixed(1)}%)`);
  console.log(`Duration > 0: ${nonZeroCount} (${(nonZeroCount/data.length*100).toFixed(1)}%)`);
  console.log(`Duration UNDEFINED: ${undefinedCount} (${(undefinedCount/data.length*100).toFixed(1)}%)`);

  // Mostrar exemplos de contextos completos
  console.log('\n🔍 EXEMPLOS DE CONTEXT COMPLETO (primeiros 3):');
  data.slice(0, 3).forEach((row, index) => {
    console.log(`\n--- Exemplo ${index + 1} ---`);
    console.log(JSON.stringify(row.conversation_context, null, 2));
  });
}

checkDurationMinutes().catch(console.error);