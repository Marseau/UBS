/**
 * CONTAR SESSÕES EXATAS - SEM APROXIMAÇÕES
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function contarSessoesExatas() {
  console.log('🔍 CONTAGEM EXATA DE SESSÕES');
  console.log('='.repeat(40));

  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  // Buscar TODOS os registros do período
  const { data: allData } = await supabase
    .from('conversation_history')
    .select('conversation_context')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  console.log(`📊 Total registros: ${allData?.length || 0}`);

  // Contar sessões únicas MANUALMENTE
  const sessionsSet = new Set();
  let registrosComSessionId = 0;
  let registrosSemSessionId = 0;

  allData?.forEach(record => {
    const sessionId = record.conversation_context?.session_id;
    if (sessionId) {
      sessionsSet.add(sessionId);
      registrosComSessionId++;
    } else {
      registrosSemSessionId++;
    }
  });

  console.log(`📊 Registros COM session_id: ${registrosComSessionId}`);
  console.log(`📊 Registros SEM session_id: ${registrosSemSessionId}`);
  console.log(`🎯 SESSÕES ÚNICAS EXATAS: ${sessionsSet.size}`);

  // Listar as primeiras 10 sessões para verificar
  console.log('\n🔍 PRIMEIRAS 10 SESSÕES:');
  const sessionsArray = Array.from(sessionsSet);
  sessionsArray.slice(0, 10).forEach((sessionId, i) => {
    console.log(`   ${i+1}. ${sessionId}`);
  });

  return sessionsSet.size;
}

contarSessoesExatas();