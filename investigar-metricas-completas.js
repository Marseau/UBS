/**
 * INVESTIGAÇÃO COMPLETA DAS MÉTRICAS DO SISTEMA
 * Identifica todas as métricas disponíveis e problemas na lógica
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigateAllMetrics() {
  console.log('🔍 INVESTIGAÇÃO COMPLETA DAS MÉTRICAS DO SISTEMA');
  console.log('='.repeat(70));
  
  try {
    // 1. ANALISAR TENANT_METRICS
    console.log('\n📊 ANÁLISE TENANT_METRICS:');
    
    const { data: tenantMetrics } = await supabase
      .from('tenant_metrics')
      .select('metric_type, period, calculated_at')
      .order('calculated_at', { ascending: false });
    
    const typesPeriods = {};
    tenantMetrics?.forEach(m => {
      if (!typesPeriods[m.metric_type]) typesPeriods[m.metric_type] = new Set();
      typesPeriods[m.metric_type].add(m.period);
    });
    
    console.log('Tipos de métricas disponíveis:');
    Object.entries(typesPeriods).forEach(([type, periods]) => {
      console.log(`   ${type}: [${Array.from(periods).join(', ')}]`);
    });
    
    // 2. EXAMINAR CADA TIPO DE MÉTRICA
    for (const type of Object.keys(typesPeriods)) {
      console.log(`\n🔍 DETALHES - ${type.toUpperCase()}:`);
      
      const { data: samples } = await supabase
        .from('tenant_metrics')
        .select('metric_data, period, calculated_at, tenant_id')
        .eq('metric_type', type)
        .order('calculated_at', { ascending: false })
        .limit(2);
      
      samples?.forEach((sample, index) => {
        console.log(`   [${index + 1}] Período: ${sample.period}, Calculado: ${sample.calculated_at}`);
        console.log(`       Tenant: ${sample.tenant_id}`);
        console.log(`       Dados:`, JSON.stringify(sample.metric_data, null, 4));
      });
    }
    
    // 3. ANALISAR PLATFORM_METRICS
    console.log('\n📊 PLATFORM_METRICS - ESTRUTURA:');
    const { data: platformMetrics } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);
      
    if (platformMetrics && platformMetrics.length > 0) {
      const metrics = platformMetrics[0];
      console.log('Métricas da plataforma disponíveis:');
      Object.entries(metrics).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    } else {
      console.log('❌ Nenhuma métrica encontrada em platform_metrics');
    }
    
    // 4. VERIFICAR CONVERSAS REAIS vs MENSAGENS
    console.log('\n💬 ANÁLISE CONVERSAS vs MENSAGENS (últimos 30 dias):');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Total mensagens
    const { count: totalMessages } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    // Mensagens de usuários
    const { count: userMessages } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString())
      .eq('is_from_user', true);
    
    // Agrupar por session_id
    const { data: allMessages } = await supabase
      .from('conversation_history')
      .select('conversation_context, tenant_id, user_id, created_at, is_from_user')
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    const sessionIds = new Set();
    const conversationsByDate = new Set();
    const tenantConversations = {};
    
    allMessages?.forEach(msg => {
      try {
        const context = typeof msg.conversation_context === 'string' ? 
          JSON.parse(msg.conversation_context) : msg.conversation_context;
        
        if (context?.session_id) {
          sessionIds.add(context.session_id);
          
          // Contar por tenant
          if (!tenantConversations[msg.tenant_id]) {
            tenantConversations[msg.tenant_id] = new Set();
          }
          tenantConversations[msg.tenant_id].add(context.session_id);
        }
        
        // Método alternativo: agrupar por tenant+user+data
        if (msg.is_from_user) {
          const date = msg.created_at.split('T')[0];
          const dateKey = `${msg.tenant_id}-${msg.user_id}-${date}`;
          conversationsByDate.add(dateKey);
        }
      } catch (e) {
        // Context inválido, ignorar
      }
    });
    
    console.log(`Total mensagens (30d): ${totalMessages}`);
    console.log(`Mensagens de usuários (30d): ${userMessages}`);
    console.log(`Conversas por session_id: ${sessionIds.size}`);
    console.log(`Conversas por tenant+user+data: ${conversationsByDate.size}`);
    
    // 5. ANÁLISE POR TENANT
    console.log('\n👥 CONVERSAS POR TENANT:');
    Object.entries(tenantConversations).forEach(([tenantId, sessions]) => {
      console.log(`   Tenant ${tenantId}: ${sessions.size} conversas`);
    });
    
    // 6. PROBLEMAS IDENTIFICADOS NO SEU SCRIPT
    console.log('\n🚨 PROBLEMAS IDENTIFICADOS NO SEU SCRIPT:');
    
    console.log('❌ PROBLEMA 1: Contando mensagens ao invés de conversas');
    console.log('   - Seu script conta conversation_history records (mensagens)');
    console.log('   - Deveria contar conversas únicas por session_id ou tenant+user+data');
    console.log(`   - Diferença: ${userMessages} mensagens vs ${sessionIds.size} conversas reais`);
    
    console.log('\n❌ PROBLEMA 2: Métricas incompletas');
    console.log('   - Tenant_metrics tem 4 tipos: ranking, risk_assessment, participation, evolution');
    console.log('   - Cada tipo tem dados JSON complexos que você não está considerando');
    console.log('   - Existem métricas de participação, evolução temporal, rankings');
    
    console.log('\n❌ PROBLEMA 3: Falta usar dados existentes');
    console.log('   - Platform_metrics já tem cálculos corretos de conversas');
    console.log('   - Seu script ignora estas métricas pré-calculadas');
    console.log('   - Deveria usar os dados existentes como base');
    
    // 7. SOLUÇÃO CORRETA
    console.log('\n✅ SOLUÇÃO CORRETA:');
    console.log('1. Use session_id do conversation_context para contar conversas reais');
    console.log('2. Aproveite os dados em tenant_metrics (participation, evolution)');
    console.log('3. Use platform_metrics como referência de cálculos corretos');
    console.log('4. Diferencie mensagens (conversation_history) de conversas (session_id únicos)');
    
    return {
      totalMessages,
      userMessages,
      realConversations: sessionIds.size,
      tenantMetricsTypes: Object.keys(typesPeriods),
      tenantsWithConversations: Object.keys(tenantConversations).length
    };
    
  } catch (error) {
    console.error('❌ Erro na investigação:', error);
  }
}

// Executar
if (require.main === module) {
  investigateAllMetrics()
    .then((result) => {
      console.log('\n🏁 INVESTIGAÇÃO CONCLUÍDA!');
      console.log('Resultados:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = { investigateAllMetrics };