/**
 * TEST NEW TENANT METRICS JOB
 * Testar o novo job que lê da tabela tenants
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Importar a classe (simulação já que é TypeScript)
class NewTenantMetricsJobService {
  
  async runTenantMetricsJob(periodDays = 30) {
    try {
      console.log(`🚀 INICIANDO NOVO JOB TENANT METRICS (${periodDays} dias)`);
      
      // 1. BUSCAR TODOS OS TENANTS ATIVOS
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, business_name, domain, status')
        .eq('status', 'active');

      if (tenantsError) {
        throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
      }

      if (!tenants || tenants.length === 0) {
        return { success: false, message: 'Nenhum tenant ativo encontrado', processed: 0 };
      }

      console.log(`✅ Encontrados ${tenants.length} tenants ativos`);
      tenants.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.business_name} (${t.domain}) - ${t.id}`);
      });

      // 2. LIMPAR REGISTROS ANTIGOS (billing_analysis)
      console.log('\n🧹 Limpando registros antigos...');
      const { error: deleteError } = await supabase
        .from('tenant_metrics')
        .delete()
        .eq('metric_type', 'billing_analysis');

      if (deleteError) {
        console.log(`⚠️ Aviso ao limpar registros antigos: ${deleteError.message}`);
      } else {
        console.log('✅ Registros antigos removidos');
      }

      // 3. PROCESSAR CADA TENANT
      let processedCount = 0;
      const calculatedAt = new Date();
      const startDate = new Date(calculatedAt);
      startDate.setDate(startDate.getDate() - periodDays);

      console.log(`\n📅 Período: ${startDate.toLocaleDateString('pt-BR')} até ${calculatedAt.toLocaleDateString('pt-BR')}`);

      for (const tenant of tenants) {
        console.log(`\n🏢 Processando: ${tenant.business_name} (${tenant.id})`);
        
        try {
          // Calcular métricas para este tenant
          const metrics = await this.calculateTenantMetrics(tenant.id, startDate, calculatedAt);
          
          // Salvar na tenant_metrics
          const { error: insertError } = await supabase
            .from('tenant_metrics')
            .insert({
              tenant_id: tenant.id,
              metric_type: 'billing_analysis',
              period: `${periodDays}d`,
              calculated_at: calculatedAt.toISOString(),
              metric_data: {
                ...metrics,
                business_name: tenant.business_name,
                domain: tenant.domain,
                period_days: periodDays,
                calculated_at: calculatedAt.toISOString()
              }
            });

          if (insertError) {
            console.log(`❌ Erro ao salvar ${tenant.business_name}: ${insertError.message}`);
          } else {
            console.log(`   ✅ Conversas: ${metrics.total_conversations}`);
            console.log(`   ✅ Agendamentos: ${metrics.total_appointments}`);
            console.log(`   ✅ MRR: R$ ${metrics.mrr_brl}`);
            console.log(`   ✅ Eficiência: ${metrics.efficiency_pct}%`);
            processedCount++;
          }

        } catch (tenantError) {
          console.log(`❌ Erro ao processar ${tenant.business_name}: ${tenantError}`);
        }
      }

      console.log(`\n🎯 JOB CONCLUÍDO: ${processedCount}/${tenants.length} tenants processados`);
      
      return {
        success: true,
        message: `Job executado com sucesso. ${processedCount} tenants processados.`,
        processed: processedCount
      };

    } catch (error) {
      console.error('❌ Erro no job:', error);
      return {
        success: false,
        message: `Erro no job: ${error}`,
        processed: 0
      };
    }
  }

  async calculateTenantMetrics(tenantId, startDate, endDate) {
    // 1. CONVERSAS (sessions únicas com conversation_outcome)
    const { data: conversationData, error: convError } = await supabase
      .from('conversation_history')
      .select('conversation_context, conversation_outcome')
      .eq('tenant_id', tenantId)
      .not('conversation_outcome', 'is', null)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    if (convError) {
      throw new Error(`Erro ao buscar conversas: ${convError.message}`);
    }

    // Contar sessions únicas
    const uniqueSessions = new Set();
    const outcomeDistribution = {};

    conversationData?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      if (sessionId) {
        uniqueSessions.add(sessionId);
      }
      
      const outcome = record.conversation_outcome;
      if (outcome) {
        outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
      }
    });

    const totalConversations = uniqueSessions.size;

    // 2. AGENDAMENTOS
    const { data: appointmentData, error: apptError } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString());

    if (apptError) {
      throw new Error(`Erro ao buscar agendamentos: ${apptError.message}`);
    }

    const totalAppointments = appointmentData?.length || 0;
    const confirmedAppointments = appointmentData?.filter(a => a.status === 'confirmed').length || 0;
    const cancelledAppointments = appointmentData?.filter(a => a.status === 'cancelled').length || 0;

    // 3. CÁLCULO DO PLANO E MRR
    const planPrice = this.calculatePlanPrice(totalConversations);
    const mrr = planPrice;

    // 4. SPAM SCORE
    const validMessages = conversationData?.filter(record => 
      record.conversation_context?.confidence_score >= 0.7
    ).length || 0;
    const totalMessages = conversationData?.length || 0;
    const spamScore = totalMessages > 0 ? ((validMessages / totalMessages) * 100) : 100;

    // 5. EFICIÊNCIA
    const efficiency = totalConversations > 0 ? ((totalAppointments / totalConversations) * 100) : 0;

    return {
      total_conversations: totalConversations,
      total_appointments: totalAppointments,
      confirmed_appointments: confirmedAppointments,
      cancelled_appointments: cancelledAppointments,
      plan_price_brl: planPrice,
      mrr_brl: mrr,
      spam_score: Math.round(spamScore * 100) / 100,
      efficiency_pct: Math.round(efficiency * 100) / 100,
      outcome_distribution: outcomeDistribution,
      valid_messages: validMessages,
      total_messages: totalMessages
    };
  }

  calculatePlanPrice(conversations) {
    // Modelo de preços baseado em conversas
    if (conversations <= 200) return 58; // Básico
    if (conversations <= 400) return 116; // Profissional
    return 290; // Enterprise
  }
}

async function testNewTenantMetricsJob() {
  console.log('🧪 TESTANDO NOVO JOB TENANT METRICS');
  console.log('='.repeat(60));

  const jobService = new NewTenantMetricsJobService();
  
  // Testar job
  const result = await jobService.runTenantMetricsJob(30);
  
  console.log('\n📊 RESULTADO DO JOB:');
  console.log(`   Success: ${result.success}`);
  console.log(`   Message: ${result.message}`);
  console.log(`   Processed: ${result.processed}`);

  // Verificar resultados
  console.log('\n🔍 VERIFICANDO RESULTADOS:');
  const { data: results, error } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, metric_data')
    .eq('metric_type', 'billing_analysis');

  if (error) {
    console.log('❌ Erro ao verificar resultados:', error);
  } else {
    console.log(`✅ Registros criados: ${results?.length || 0}`);
    
    results?.forEach((record, i) => {
      const data = record.metric_data;
      console.log(`\n   ${i + 1}. ${data.business_name}`);
      console.log(`      Conversas: ${data.total_conversations}`);
      console.log(`      Agendamentos: ${data.total_appointments}`);
      console.log(`      MRR: R$ ${data.mrr_brl}`);
      console.log(`      Eficiência: ${data.efficiency_pct}%`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTE DO NOVO JOB CONCLUÍDO');
}

testNewTenantMetricsJob();