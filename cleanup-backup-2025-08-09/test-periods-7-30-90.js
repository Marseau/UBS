/**
 * TEST PERIODS 7, 30, 90 DAYS
 * Testar job para todos os períodos e mostrar resultados para validação
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class NewTenantMetricsJobService {
  async runTenantMetricsJob(periodDays = 30) {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, business_name, domain')
      .eq('status', 'active');
    
    // Limpar registros antigos deste período
    await supabase
      .from('tenant_metrics')
      .delete()
      .eq('metric_type', 'billing_analysis')
      .eq('period', `${periodDays}d`);
    
    const calculatedAt = new Date();
    const startDate = new Date(calculatedAt);
    startDate.setDate(startDate.getDate() - periodDays);

    console.log(`📊 RESULTADOS ${periodDays} DIAS (${startDate.toLocaleDateString('pt-BR')} até ${calculatedAt.toLocaleDateString('pt-BR')}):`);
    console.log('='.repeat(80));

    const results = [];

    for (const tenant of tenants) {
      const metrics = await this.calculateTenantMetrics(tenant.id, startDate, calculatedAt);
      
      // Salvar na tenant_metrics
      await supabase.from('tenant_metrics').insert({
        tenant_id: tenant.id,
        metric_type: 'billing_analysis',
        period: `${periodDays}d`,
        calculated_at: calculatedAt.toISOString(),
        metric_data: { 
          ...metrics, 
          business_name: tenant.business_name, 
          domain: tenant.domain, 
          period_days: periodDays 
        }
      });

      results.push({
        name: tenant.business_name,
        conversations: metrics.total_conversations,
        appointments: metrics.total_appointments,
        efficiency: metrics.efficiency_pct,
        inform: metrics.conversation_inform,
        abandoned: metrics.conversation_abandoned,
        spam: metrics.conversation_spam,
        rescheduled: metrics.conversation_rescheduled,
        conversationMinutes: metrics.conversation_minutes,
        conversationTokens: metrics.conversation_tokens,
        breakdown: metrics.outcome_breakdown
      });
    }

    // Mostrar resultados organizados
    results.forEach((result, i) => {
      console.log(`\n${i + 1}. ${result.name}:`);
      console.log(`   Conversas: ${result.conversations}`);
      console.log(`   Agendamentos: ${result.appointments}`);
      console.log(`   Eficiência: ${result.efficiency}%`);
      console.log(`   Informativos: ${result.inform}`);
      console.log(`   Abandonos: ${result.abandoned}`);
      console.log(`   Spam: ${result.spam}`);
      console.log(`   Reagendamentos: ${result.rescheduled}`);
      console.log(`   Total minutos: ${result.conversationMinutes} min`);
      console.log(`   Total tokens: ${result.conversationTokens}`);
      
      if (Object.keys(result.breakdown).length > 0) {
        console.log(`   Breakdown: ${JSON.stringify(result.breakdown)}`);
      }
    });

    return results;
  }

  async calculateTenantMetrics(tenantId, startDate, endDate) {
    // 1. CONVERSAS (sessions únicas do conversation_context - IGUAL JOB REAL)
    const { data: conversationData } = await supabase
      .from('conversation_history')
      .select('conversation_outcome, conversation_context, created_at')
      .eq('tenant_id', tenantId)
      .not('conversation_context', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    // LÓGICA CORRETA: contar apenas outcomes appointment_created (como no job real)
    const uniqueSessions = new Set();
    const billableOutcomes = [];
    
    conversationData?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      if (sessionId) {
        uniqueSessions.add(sessionId);
      }
      if (record.conversation_outcome === 'appointment_created') {
        billableOutcomes.push(record);
      }
    });
    
    // Use billableOutcomes.length como total_conversations (igual job real)
    const totalConversationsReal = billableOutcomes.length;

    // 2. AGENDAMENTOS (criados pela IA)
    const { data: appointmentsFromAI } = await supabase
      .from('conversation_history')
      .select('conversation_outcome')
      .eq('tenant_id', tenantId)
      .eq('conversation_outcome', 'appointment_created')
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    // 3. BUSCAR TODOS OS OUTCOMES PARA NOVAS MÉTRICAS
    const { data: allOutcomes } = await supabase
      .from('conversation_history')
      .select('conversation_outcome')
      .eq('tenant_id', tenantId)
      .not('conversation_outcome', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    // 4. CALCULAR NOVAS MÉTRICAS
    const outcomeCount = {};
    allOutcomes?.forEach(record => {
      const outcome = record.conversation_outcome;
      outcomeCount[outcome] = (outcomeCount[outcome] || 0) + 1;
    });

    // conversation_inform (informativos)
    const informOutcomes = ['info_request_fulfilled', 'business_hours_inquiry', 'price_inquiry', 'location_inquiry'];
    const conversationInform = informOutcomes.reduce((sum, outcome) => sum + (outcomeCount[outcome] || 0), 0);

    // conversation_abandoned (abandonos)
    const abandonedOutcomes = ['booking_abandoned', 'timeout_abandoned'];
    const conversationAbandoned = abandonedOutcomes.reduce((sum, outcome) => sum + (outcomeCount[outcome] || 0), 0);

    // conversation_spam (spam)
    const spamOutcomes = ['spam_detected', 'wrong_number'];
    const conversationSpam = spamOutcomes.reduce((sum, outcome) => sum + (outcomeCount[outcome] || 0), 0);

    // conversation_rescheduled (todos os de gestão EXCETO appointment_confirmed)
    const rescheduledOutcomes = ['appointment_rescheduled', 'appointment_cancelled', 'appointment_inquiry', 'appointment_modified', 'appointment_noshow_followup'];
    const conversationRescheduled = rescheduledOutcomes.reduce((sum, outcome) => sum + (outcomeCount[outcome] || 0), 0);

    // 5. CONVERSATION_MINUTES (MESMA lógica do job real)
    const uniqueSessionsMinutes = new Set();
    let totalMinutes = 0;
    
    conversationData?.forEach(record => {
      const context = record.conversation_context;
      const sessionId = context?.session_id;
      
      if (sessionId && !uniqueSessionsMinutes.has(sessionId)) {
        uniqueSessionsMinutes.add(sessionId);
        // SOMAR duration_minutes APENAS UMA VEZ por sessão (igual job real)
        totalMinutes += context?.duration_minutes || 0;
      }
    });

    // 6. CONVERSATION_TOKENS (somar TODOS os tokens de cada sessão)
    const { data: tokensData } = await supabase
      .from('conversation_history')
      .select('tokens_used, conversation_context')
      .eq('tenant_id', tenantId)
      .not('conversation_context', 'is', null)
      .not('tokens_used', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    const sessionTokens = {};
    
    tokensData?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      const tokens = record.tokens_used;
      
      if (sessionId && tokens && tokens > 0) {
        if (!sessionTokens[sessionId]) {
          sessionTokens[sessionId] = 0;
        }
        // SOMAR todos os tokens da sessão
        sessionTokens[sessionId] += tokens;
      }
    });
    
    const totalTokens = Object.values(sessionTokens).reduce((sum, tokens) => sum + tokens, 0);
    
    const totalConversations = uniqueSessions.size;
    const totalAppointments = appointmentsFromAI?.length || 0;
    const efficiency = totalConversations > 0 ? ((totalAppointments / totalConversations) * 100) : 0;

    return {
      total_conversations: totalConversationsReal,
      total_appointments: totalAppointments,
      efficiency_pct: totalConversationsReal > 0 ? Math.round((totalAppointments / totalConversationsReal) * 10000) / 100 : 0,
      conversation_inform: conversationInform,
      conversation_abandoned: conversationAbandoned,
      conversation_spam: conversationSpam,
      conversation_rescheduled: conversationRescheduled,
      conversation_minutes: Math.round(totalMinutes * 100) / 100,
      conversation_tokens: totalTokens,
      outcome_breakdown: outcomeCount
    };
  }
}

async function testAllPeriods() {
  console.log('🧪 MÉTRICAS POR TENANT POR PERÍODO');
  console.log('='.repeat(80));

  const jobService = new NewTenantMetricsJobService();
  
  // Buscar todos os tenants ativos
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, business_name, domain')
    .eq('status', 'active');

  const periods = [7, 30, 90];
  
  // Para cada tenant, mostrar todos os períodos
  for (const tenant of tenants) {
    console.log(`\n🏢 ${tenant.business_name.toUpperCase()}`);
    console.log('='.repeat(60));
    
    for (const periodDays of periods) {
      const calculatedAt = new Date();
      const startDate = new Date(calculatedAt);
      startDate.setDate(startDate.getDate() - periodDays);
      
      const metrics = await jobService.calculateTenantMetrics(tenant.id, startDate, calculatedAt);
      
      console.log(`\n📅 ${periodDays} DIAS (${startDate.toLocaleDateString('pt-BR')} até ${calculatedAt.toLocaleDateString('pt-BR')}):`);
      console.log(`   💬 Conversas: ${metrics.total_conversations}`);
      console.log(`   📅 Agendamentos: ${metrics.total_appointments}`);
      console.log(`   📈 Eficiência: ${metrics.efficiency_pct}%`);
      console.log(`   ℹ️  Informativos: ${metrics.conversation_inform}`);
      console.log(`   ❌ Abandonos: ${metrics.conversation_abandoned}`);
      console.log(`   🚫 Spam: ${metrics.conversation_spam}`);
      console.log(`   🔄 Reagendamentos: ${metrics.conversation_rescheduled}`);
      console.log(`   ⏱️  Minutos: ${metrics.conversation_minutes}`);
      console.log(`   🤖 Tokens: ${metrics.conversation_tokens}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🧪 ANÁLISE POR TENANT POR PERÍODO CONCLUÍDA');
}

testAllPeriods();