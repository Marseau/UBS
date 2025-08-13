/**
 * CORRIGIR PERÍODOS - SESSÕES POR DATA DE CRIAÇÃO
 * Calcular apenas sessões que INICIARAM no período específico
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function corrigirPeriodosSessoes() {
  console.log('🔄 CORRIGINDO CÁLCULO POR PERÍODOS ESPECÍFICOS');
  console.log('='.repeat(60));

  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681'; // Bella Vista
  const agora = new Date();

  // Definir períodos ESPECÍFICOS (não sobrepostos)
  const periods = [
    {
      name: '7 dias',
      start: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: agora
    },
    {
      name: '23 dias (8-30)', // 30 - 7 = 23 dias adicionais
      start: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      name: '60 dias (31-90)', // 90 - 30 = 60 dias adicionais  
      start: new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000),
      end: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
    }
  ];

  console.log(`🏢 Tenant: Bella Vista Spa & Salon\n`);

  for (const period of periods) {
    console.log(`📅 PERÍODO: ${period.name}`);
    console.log(`   De: ${period.start.toLocaleDateString('pt-BR')}`);
    console.log(`   Até: ${period.end.toLocaleDateString('pt-BR')}`);

    // Buscar sessões que INICIARAM neste período específico
    const { data: sessionData } = await supabase
      .from('conversation_history')
      .select('conversation_context, created_at')
      .eq('tenant_id', tenantId)
      .not('conversation_context', 'is', null)
      .gte('created_at', period.start.toISOString())
      .lt('created_at', period.end.toISOString());

    // Encontrar a primeira mensagem de cada sessão (quando a sessão iniciou)
    const sessionStarts = {};
    sessionData?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      const createdAt = new Date(record.created_at);
      
      if (sessionId) {
        if (!sessionStarts[sessionId] || createdAt < sessionStarts[sessionId]) {
          sessionStarts[sessionId] = createdAt;
        }
      }
    });

    // Contar apenas sessões que realmente iniciaram neste período
    const sessoesIniciadasNoPeriodo = Object.entries(sessionStarts).filter(
      ([sessionId, startTime]) => startTime >= period.start && startTime < period.end
    );

    console.log(`   📊 Total registros: ${sessionData?.length || 0}`);
    console.log(`   📊 Sessões únicas: ${Object.keys(sessionStarts).length}`);
    console.log(`   🎯 Sessões iniciadas no período: ${sessoesIniciadasNoPeriodo.length}`);
    console.log('');
  }

  // Comparar com método atual (sobreposição)
  console.log('📊 COMPARAÇÃO COM MÉTODO ATUAL:');
  
  const periods2 = [
    { name: '7 dias', days: 7 },
    { name: '30 dias', days: 30 },
    { name: '90 dias', days: 90 }
  ];

  for (const period of periods2) {
    const startDate = new Date(agora);
    startDate.setDate(startDate.getDate() - period.days);

    const { data: allData } = await supabase
      .from('conversation_history')
      .select('conversation_context')
      .eq('tenant_id', tenantId)
      .not('conversation_context', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', agora.toISOString());

    const uniqueSessions = new Set();
    allData?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      if (sessionId) uniqueSessions.add(sessionId);
    });

    console.log(`   ${period.name} (método atual): ${uniqueSessions.size} sessões`);
  }
}

corrigirPeriodosSessoes();