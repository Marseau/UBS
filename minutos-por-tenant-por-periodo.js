/**
 * MINUTOS POR TENANT POR PERÍODO
 * Calcular conversation_minutes para cada tenant em cada período
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function minutosPorTenantPorPeriodo() {
  console.log('📊 CONVERSATION_MINUTES - POR TENANT POR PERÍODO');
  console.log('='.repeat(70));

  const tenants = [
    { id: '33b8c488-5aa9-4891-b335-701d10296681', name: 'Bella Vista Spa & Salon' },
    { id: 'fe1fbd26-16cf-4106-9be0-390bf8345304', name: 'Studio Glamour Rio' },
    { id: '5bd592ee-8247-4a62-862e-7491fa499103', name: 'Charme Total BH' },
    { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã' },
    { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico Equilíbrio' }
  ];

  const periods = [
    { name: '7 DIAS', days: 7 },
    { name: '30 DIAS', days: 30 },
    { name: '90 DIAS', days: 90 }
  ];

  for (const period of periods) {
    console.log(`\n📅 ============ ${period.name} ============`);
    
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - period.days);

    console.log(`Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}\n`);

    for (const tenant of tenants) {
      // Buscar dados do tenant no período
      const { data: conversationData } = await supabase
        .from('conversation_history')
        .select('conversation_context')
        .eq('tenant_id', tenant.id)
        .not('conversation_context', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString());

      // Calcular minutos por sessão única
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
      
      const totalMinutos = Object.values(sessionMinutes).reduce((sum, minutes) => sum + minutes, 0);
      const totalSessions = Object.keys(sessionMinutes).length;

      console.log(`🏢 ${tenant.name}:`);
      console.log(`   Sessões: ${totalSessions}`);
      console.log(`   Minutos: ${totalMinutos}`);
      console.log('');
    }
  }
}

minutosPorTenantPorPeriodo();