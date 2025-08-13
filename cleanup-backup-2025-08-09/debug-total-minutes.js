/**
 * DEBUG TOTAL MINUTES
 * Investigar por que os valores estão errados
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function debugTotalMinutes() {
  console.log('🔍 DEBUGANDO CONVERSATION_MINUTES');
  console.log('='.repeat(50));

  // 1. TOTAL GERAL DE TODAS AS SESSÕES
  const { data: allData } = await supabase
    .from('conversation_history')
    .select('conversation_context, tenant_id')
    .not('conversation_context', 'is', null);

  let totalMinutesAll = 0;
  const sessionMinutesAll = {};
  
  allData?.forEach(record => {
    const context = record.conversation_context;
    if (context?.session_id && context?.duration_minutes) {
      if (!sessionMinutesAll[context.session_id]) {
        sessionMinutesAll[context.session_id] = 0;
      }
      sessionMinutesAll[context.session_id] += context.duration_minutes;
    }
  });
  
  totalMinutesAll = Object.values(sessionMinutesAll).reduce((sum, min) => sum + min, 0);
  
  console.log(`📊 TOTAL GERAL: ${totalMinutesAll} minutos`);
  console.log(`📊 TOTAL SESSÕES: ${Object.keys(sessionMinutesAll).length}`);

  // 2. POR TENANT ESPECÍFICO (Centro Terapêutico)
  const tenantId = 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8'; // Centro Terapêutico
  
  const { data: tenantData } = await supabase
    .from('conversation_history')
    .select('conversation_context')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null);

  const sessionMinutesTenant = {};
  
  tenantData?.forEach(record => {
    const context = record.conversation_context;
    if (context?.session_id && context?.duration_minutes) {
      if (!sessionMinutesTenant[context.session_id]) {
        sessionMinutesTenant[context.session_id] = 0;
      }
      sessionMinutesTenant[context.session_id] += context.duration_minutes;
    }
  });
  
  const totalMinutesTenant = Object.values(sessionMinutesTenant).reduce((sum, min) => sum + min, 0);
  
  console.log(`\n🏢 CENTRO TERAPÊUTICO:`);
  console.log(`   Minutos: ${totalMinutesTenant}`);
  console.log(`   Sessões: ${Object.keys(sessionMinutesTenant).length}`);

  // 3. VERIFICAR SE MINUTOS DO TENANT = TOTAL (ERRO!)
  if (totalMinutesTenant === totalMinutesAll) {
    console.log('\n🚨 ERRO ENCONTRADO: Minutos do tenant = Total geral!');
    console.log('💡 Problema: Query não está filtrando por tenant corretamente');
  }
}

debugTotalMinutes();