require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debugNewMetrics() {
  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
  const currentStart = new Date('2025-07-28');  
  const currentEnd = new Date();
  
  console.log('🔍 DEBUG: Por que as novas métricas estão zeradas?');
  console.log('Tenant ID:', tenantId);
  console.log('Período:', currentStart.toISOString(), 'até', currentEnd.toISOString());
  
  // 1. Debug minutos por conversa
  console.log('\n⏱️ TESTANDO MINUTOS POR CONVERSA:');
  const { data: conversations } = await supabase
    .from('conversation_history')
    .select('conversation_context, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', currentStart.toISOString())
    .lte('created_at', currentEnd.toISOString())
    .not('conversation_context', 'is', null)
    .limit(10);
  
  console.log('Conversas encontradas:', conversations?.length || 0);
  
  if (conversations && conversations.length > 0) {
    let totalMinutes = 0;
    let conversasComDuracao = 0;
    
    conversations.forEach((conv, i) => {
      const duration = conv.conversation_context?.duration_minutes || 0;
      console.log(`Conversa ${i + 1}:`, {
        session_id: conv.conversation_context?.session_id?.substring(0, 8) + '...',
        duration_minutes: duration,
        created_at: conv.created_at
      });
      
      if (duration > 0) {
        totalMinutes += duration;
        conversasComDuracao++;
      }
    });
    
    console.log('Total conversas com duração:', conversasComDuracao);
    console.log('Total minutos:', totalMinutes);
    console.log('Média minutos:', conversasComDuracao > 0 ? totalMinutes / conversasComDuracao : 0);
  }
  
  // 2. Debug clientes únicos
  console.log('\n👥 TESTANDO CLIENTES ÚNICOS:');
  const { data: uniqueUsers } = await supabase
    .from('appointments')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .not('user_id', 'is', null);
  
  if (uniqueUsers) {
    const uniqueCount = new Set(uniqueUsers.map(u => u.user_id)).size;
    console.log('Total appointments:', uniqueUsers.length);
    console.log('Clientes únicos:', uniqueCount);
  }
  
  // 3. Debug serviços
  console.log('\n🛠️ TESTANDO SERVIÇOS:');
  const { count: totalServices } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  
  const { count: activeServices } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  
  console.log('Total serviços:', totalServices);
  console.log('Serviços ativos:', activeServices);
  
  // 4. Debug custos USD
  console.log('\n💰 TESTANDO CUSTOS USD:');
  const { data: costConversations } = await supabase
    .from('conversation_history')
    .select('api_cost_usd, processing_cost_usd, conversation_context, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', currentStart.toISOString())
    .lte('created_at', currentEnd.toISOString())
    .not('conversation_context', 'is', null)
    .limit(5);
  
  if (costConversations) {
    let totalCost = 0;
    costConversations.forEach((conv, i) => {
      const apiCost = conv.api_cost_usd || 0;
      const processingCost = conv.processing_cost_usd || 0;
      const total = apiCost + processingCost;
      totalCost += total;
      
      console.log(`Conversa ${i + 1}:`, {
        api_cost: apiCost,
        processing_cost: processingCost,
        total_cost: total
      });
    });
    
    console.log('Custo total (5 conversas):', totalCost);
    console.log('Custo médio:', costConversations.length > 0 ? totalCost / costConversations.length : 0);
  }
}

debugNewMetrics();