/**
 * CALCULAR CORRETO MINUTOS
 * Verificar exatamente como está sendo calculado
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function calcularCorretoMinutos() {
  console.log('🔍 CALCULANDO CORRETO - CONVERSATION_MINUTES');
  console.log('='.repeat(60));

  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681'; // Bella Vista
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  console.log(`📅 Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}`);
  console.log(`🏢 Tenant: Bella Vista Spa & Salon`);

  // Buscar TODOS os registros com conversation_context para este tenant
  const { data: allRecords } = await supabase
    .from('conversation_history')
    .select('conversation_context, created_at')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  console.log(`\n📊 TOTAL DE REGISTROS: ${allRecords?.length || 0}`);

  // Analisar structure dos dados
  if (allRecords && allRecords.length > 0) {
    console.log('\n📋 PRIMEIROS 5 REGISTROS:');
    allRecords.slice(0, 5).forEach((record, i) => {
      const ctx = record.conversation_context;
      console.log(`\n   Registro ${i + 1}:`);
      console.log(`   Session ID: ${ctx?.session_id || 'N/A'}`);
      console.log(`   Duration Minutes: ${ctx?.duration_minutes || 'N/A'}`);
      console.log(`   Created At: ${record.created_at}`);
      console.log(`   Context Keys: [${Object.keys(ctx || {}).join(', ')}]`);
    });
  }

  // Calcular da forma atual (que você disse estar errada)
  const sessionMinutes = {};
  
  allRecords?.forEach(record => {
    const context = record.conversation_context;
    if (context?.session_id && context?.duration_minutes && context.duration_minutes > 0) {
      if (!sessionMinutes[context.session_id]) {
        sessionMinutes[context.session_id] = 0;
      }
      sessionMinutes[context.session_id] += context.duration_minutes;
    }
  });
  
  const totalMinutos = Object.values(sessionMinutes).reduce((sum, minutes) => sum + minutes, 0);
  const totalSessions = Object.keys(sessionMinutes).length;

  console.log(`\n📊 RESULTADO ATUAL (que você disse estar errado):`);
  console.log(`   Sessões únicas: ${totalSessions}`);
  console.log(`   Total minutos: ${totalMinutos}`);

  // Mostrar breakdown detalhado
  console.log(`\n📋 BREAKDOWN POR SESSÃO (primeiras 10):`);
  Object.entries(sessionMinutes).slice(0, 10).forEach(([sessionId, minutes], i) => {
    console.log(`   ${i + 1}. ${sessionId}: ${minutes} minutos`);
  });

  // Calcular alternativas possíveis
  console.log(`\n🤔 ALTERNATIVAS POSSÍVEIS:`);
  
  // Alternativa 1: Somar TODOS duration_minutes (sem agrupar por sessão)
  let totalTodosMinutos = 0;
  allRecords?.forEach(record => {
    const context = record.conversation_context;
    if (context?.duration_minutes && context.duration_minutes > 0) {
      totalTodosMinutos += context.duration_minutes;
    }
  });
  console.log(`   A) Somar todos duration_minutes: ${totalTodosMinutos} minutos`);

  // Alternativa 2: Média por sessão
  const mediaMinutos = totalSessions > 0 ? (totalMinutos / totalSessions).toFixed(2) : 0;
  console.log(`   B) Média por sessão: ${mediaMinutos} minutos`);

  // Alternativa 3: Contar apenas sessões com minutos > 0
  const sessoesComMinutos = Object.values(sessionMinutes).filter(min => min > 0).length;
  console.log(`   C) Sessões com minutos > 0: ${sessoesComMinutos}`);
}

calcularCorretoMinutos();