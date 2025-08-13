/**
 * TEST DEBUG TENANT MINUTES
 * Testar especificamente o cálculo de minutos por tenant
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testTenantMinutes(tenantId, tenantName) {
  console.log(`\n🏢 TESTANDO: ${tenantName}`);
  console.log(`   ID: ${tenantId}`);
  
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  // Buscar dados exatamente como no job
  const { data: conversationData } = await supabase
    .from('conversation_history')
    .select('conversation_context')
    .eq('tenant_id', tenantId)
    .not('conversation_context', 'is', null)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  console.log(`   📊 Registros encontrados: ${conversationData?.length || 0}`);

  // Calcular minutos como no job
  const sessionMinutes = {};
  
  conversationData?.forEach(record => {
    const context = record.conversation_context;
    if (context?.session_id && context?.duration_minutes && context.duration_minutes > 0) {
      if (!sessionMinutes[context.session_id]) {
        sessionMinutes[context.session_id] = 0;
      }
      sessionMinutes[context.session_id] += context.duration_minutes;
    }
  });
  
  const totalMinutes = Object.values(sessionMinutes).reduce((sum, minutes) => sum + minutes, 0);
  const totalSessions = Object.keys(sessionMinutes).length;

  console.log(`   📊 Sessões únicas: ${totalSessions}`);
  console.log(`   📊 Total minutos: ${totalMinutes}`);
  
  // Mostrar breakdown por sessão
  if (totalSessions > 0) {
    console.log(`   📋 Primeiras 3 sessões:`);
    Object.entries(sessionMinutes).slice(0, 3).forEach(([sessionId, minutes], i) => {
      console.log(`      ${i + 1}. ${sessionId.substring(0, 8)}...: ${minutes} min`);
    });
  }
}

async function debugAllTenants() {
  console.log('🔍 DEBUG MINUTOS POR TENANT (30 DIAS)');
  console.log('='.repeat(50));

  const tenants = [
    { id: '33b8c488-5aa9-4891-b335-701d10296681', name: 'Bella Vista Spa & Salon' },
    { id: 'fe1fbd26-16cf-4106-9be0-390bf8345304', name: 'Studio Glamour Rio' },
    { id: '5bd592ee-8247-4a62-862e-7491fa499103', name: 'Charme Total BH' },
    { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã' },
    { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico Equilíbrio' }
  ];

  for (const tenant of tenants) {
    await testTenantMinutes(tenant.id, tenant.name);
  }
}

debugAllTenants();