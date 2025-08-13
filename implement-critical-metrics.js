const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Script para implementar todas as métricas críticas identificadas
async function implementCriticalMetrics() {
  console.log('🚀 IMPLEMENTANDO MÉTRICAS CRÍTICAS NO SISTEMA UBS');
  console.log('=' .repeat(60));
  
  const results = {
    metrics_implemented: 0,
    tenants_processed: 0,
    total_records_created: 0,
    errors: [],
    execution_time: null
  };
  
  const startTime = Date.now();
  
  try {
    // Buscar todos os tenants ativos
    console.log('\n🔍 Carregando tenants ativos...');
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, business_name, domain, subscription_plan, created_at')
      .eq('status', 'active');
    
    if (tenantsError) throw new Error(`Erro ao carregar tenants: ${tenantsError.message}`);
    
    console.log(`✅ ${tenants.length} tenants encontrados`);
    results.tenants_processed = tenants.length;
    
    // Limpar métricas antigas
    console.log('\n🧹 Limpando métricas antigas...');
    const metricsToClean = [
      'revenue_per_customer',
      'conversion_rate', 
      'no_show_rate',
      'customer_lifetime_value',
      'trial_conversion_rate',
      'external_appointment_ratio',
      'whatsapp_quality_score',
      'ai_quality_score'
    ];
    
    for (const metricType of metricsToClean) {
      await supabase
        .from('tenant_metrics')
        .delete()
        .eq('metric_type', metricType);
    }
    
    console.log('✅ Métricas antigas removidas');
    
    // Implementar cada métrica
    console.log('\n📊 IMPLEMENTANDO MÉTRICAS...\n');
    
    // === MÉTRICA 1: RECEITA POR CLIENTE ===
    console.log('💰 1. RECEITA POR CLIENTE');
    await implementRevenuePerCustomer(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 2: TAXA DE CONVERSÃO ===
    console.log('\n🎯 2. TAXA DE CONVERSÃO');
    await implementConversionRate(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 3: TAXA DE NO-SHOW ===
    console.log('\n📅 3. TAXA DE NO-SHOW');
    await implementNoShowRate(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 4: CUSTOMER LIFETIME VALUE ===
    console.log('\n💎 4. CUSTOMER LIFETIME VALUE');
    await implementCustomerLifetimeValue(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 5: TRIAL CONVERSION RATE ===
    console.log('\n🆓 5. TRIAL CONVERSION RATE');
    await implementTrialConversionRate(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 6: EXTERNAL APPOINTMENT RATIO ===
    console.log('\n📱 6. EXTERNAL APPOINTMENT RATIO');
    await implementExternalAppointmentRatio(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 7: WHATSAPP QUALITY SCORE ===
    console.log('\n📞 7. WHATSAPP QUALITY SCORE');
    await implementWhatsAppQualityScore(tenants);
    results.metrics_implemented++;
    
    // === MÉTRICA 8: AI QUALITY BY SEGMENT ===
    console.log('\n🤖 8. AI QUALITY BY SEGMENT');
    await implementAIQualityScore(tenants);
    results.metrics_implemented++;
    
    // Contar total de registros criados
    const { count } = await supabase
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true })
      .in('metric_type', metricsToClean);
    
    results.total_records_created = count || 0;
    results.execution_time = Date.now() - startTime;
    
    // Relatório final
    console.log('\n🎉 IMPLEMENTAÇÃO CONCLUÍDA!');
    console.log('=' .repeat(60));
    console.log(`✅ ${results.metrics_implemented} métricas implementadas`);
    console.log(`✅ ${results.tenants_processed} tenants processados`);
    console.log(`✅ ${results.total_records_created} registros de métricas criados`);
    console.log(`⏱️ Tempo de execução: ${(results.execution_time / 1000).toFixed(2)}s`);
    
    return results;
    
  } catch (error) {
    results.errors.push(error.message);
    console.error('❌ Erro na implementação:', error);
    throw error;
  }
}

// === IMPLEMENTAÇÕES DAS MÉTRICAS ===

async function implementRevenuePerCustomer(tenants) {
  for (const tenant of tenants) {
    try {
      // Calcular receita por cliente
      const { data: revenueData } = await supabase.rpc('calculate_revenue_per_customer', {
        p_tenant_id: tenant.id,
        p_period_days: 30
      });
      
      if (!revenueData || revenueData.length === 0) {
        // Fallback manual se RPC não existir
        const { data: appointments } = await supabase
          .from('appointments')
          .select('final_price, user_id, status')
          .eq('tenant_id', tenant.id)
          .eq('status', 'completed')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        
        if (appointments && appointments.length > 0) {
          const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.final_price || 0), 0);
          const uniqueCustomers = new Set(appointments.map(apt => apt.user_id)).size;
          const revenuePerCustomer = uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;
          
          await supabase.from('tenant_metrics').insert({
            tenant_id: tenant.id,
            metric_type: 'revenue_per_customer',
            period: '30d',
            metric_data: {
              total_revenue: totalRevenue,
              unique_customers: uniqueCustomers,
              revenue_per_customer: revenuePerCustomer,
              avg_appointment_value: appointments.length > 0 ? totalRevenue / appointments.length : 0,
              total_appointments: appointments.length,
              period_days: 30,
              calculated_at: new Date().toISOString()
            }
          });
          
          console.log(`   ✅ ${tenant.business_name}: R$ ${revenuePerCustomer.toFixed(2)}/cliente`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

async function implementConversionRate(tenants) {
  for (const tenant of tenants) {
    try {
      // Buscar conversas com sessions
      const { data: conversations } = await supabase
        .from('conversation_history')
        .select('conversation_context, conversation_outcome')
        .eq('tenant_id', tenant.id)
        .not('conversation_context->session_id', 'is', null);
      
      if (conversations && conversations.length > 0) {
        // Agrupar por session_id
        const sessions = new Map();
        conversations.forEach(conv => {
          const sessionId = conv.conversation_context?.session_id;
          if (sessionId) {
            if (!sessions.has(sessionId)) {
              sessions.set(sessionId, { converted: false, outcomes: [] });
            }
            if (conv.conversation_outcome) {
              sessions.get(sessionId).outcomes.push(conv.conversation_outcome);
              if (conv.conversation_outcome === 'appointment_created') {
                sessions.get(sessionId).converted = true;
              }
            }
          }
        });
        
        const totalSessions = sessions.size;
        const convertedSessions = Array.from(sessions.values()).filter(s => s.converted).length;
        const conversionRate = totalSessions > 0 ? (convertedSessions / totalSessions) * 100 : 0;
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'conversion_rate',
          period: '30d',
          metric_data: {
            total_conversations: totalSessions,
            converted_conversations: convertedSessions,
            operational_efficiency_pct: conversionRate,
            total_messages: conversations.length,
            period_days: 30,
            calculated_at: new Date().toISOString()
          }
        });
        
        console.log(`   ✅ ${tenant.business_name}: ${conversionRate.toFixed(2)}% conversão`);
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

async function implementNoShowRate(tenants) {
  for (const tenant of tenants) {
    try {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      
      if (appointments && appointments.length > 0) {
        const totalAppointments = appointments.length;
        const noShows = appointments.filter(apt => apt.status === 'no_show').length;
        const completed = appointments.filter(apt => apt.status === 'completed').length;
        const cancelled = appointments.filter(apt => apt.status === 'cancelled').length;
        const noShowRate = totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0;
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'no_show_rate',
          period: '30d',
          metric_data: {
            total_appointments: totalAppointments,
            no_shows: noShows,
            completed: completed,
            cancelled: cancelled,
            no_show_rate_pct: noShowRate,
            completion_rate_pct: (completed / totalAppointments) * 100,
            period_days: 30,
            calculated_at: new Date().toISOString()
          }
        });
        
        console.log(`   ✅ ${tenant.business_name}: ${noShowRate.toFixed(2)}% no-show`);
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

async function implementCustomerLifetimeValue(tenants) {
  for (const tenant of tenants) {
    try {
      const { data: customerData } = await supabase
        .from('appointments')
        .select('user_id, final_price, start_time, status')
        .eq('tenant_id', tenant.id)
        .eq('status', 'completed')
        .order('start_time');
      
      if (customerData && customerData.length > 0) {
        const customerMetrics = new Map();
        
        customerData.forEach(apt => {
          if (!customerMetrics.has(apt.user_id)) {
            customerMetrics.set(apt.user_id, {
              appointments: [],
              totalRevenue: 0,
              firstVisit: apt.start_time,
              lastVisit: apt.start_time
            });
          }
          
          const customer = customerMetrics.get(apt.user_id);
          customer.appointments.push(apt);
          customer.totalRevenue += apt.final_price || 0;
          customer.lastVisit = apt.start_time;
        });
        
        // Calcular CLV médio
        let totalCLV = 0;
        let customersWithMultipleVisits = 0;
        
        customerMetrics.forEach((customer, userId) => {
          if (customer.appointments.length > 1) {
            const lifetimeMonths = Math.max(1, 
              (new Date(customer.lastVisit) - new Date(customer.firstVisit)) / (1000 * 60 * 60 * 24 * 30)
            );
            const avgAppointmentValue = customer.totalRevenue / customer.appointments.length;
            const appointmentsPerMonth = customer.appointments.length / lifetimeMonths;
            const clv = avgAppointmentValue * appointmentsPerMonth * 12; // CLV anual
            
            totalCLV += clv;
            customersWithMultipleVisits++;
          }
        });
        
        const avgCLV = customersWithMultipleVisits > 0 ? totalCLV / customersWithMultipleVisits : 0;
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'customer_lifetime_value',
          period: '90d',
          metric_data: {
            total_customers: customerMetrics.size,
            customers_with_multiple_visits: customersWithMultipleVisits,
            avg_clv: avgCLV,
            total_revenue: customerData.reduce((sum, apt) => sum + (apt.final_price || 0), 0),
            avg_appointments_per_customer: customerData.length / customerMetrics.size,
            period_days: 90,
            calculated_at: new Date().toISOString()
          }
        });
        
        console.log(`   ✅ ${tenant.business_name}: R$ ${avgCLV.toFixed(2)} CLV médio`);
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

async function implementTrialConversionRate(tenants) {
  try {
    // Esta métrica é global, não por tenant
    const { data: payments } = await supabase
      .from('subscription_payments')
      .select('tenant_id, subscription_plan, payment_date')
      .order('payment_date');
    
    if (payments && payments.length > 0) {
      const tenantTrials = new Map();
      
      payments.forEach(payment => {
        if (!tenantTrials.has(payment.tenant_id)) {
          tenantTrials.set(payment.tenant_id, {
            hadTrial: false,
            converted: false,
            trialStart: null,
            paidStart: null
          });
        }
        
        const trial = tenantTrials.get(payment.tenant_id);
        if (payment.subscription_plan === 'free') {
          trial.hadTrial = true;
          trial.trialStart = payment.payment_date;
        } else {
          trial.converted = true;
          if (!trial.paidStart) trial.paidStart = payment.payment_date;
        }
      });
      
      const totalTrials = Array.from(tenantTrials.values()).filter(t => t.hadTrial).length;
      const convertedTrials = Array.from(tenantTrials.values()).filter(t => t.hadTrial && t.converted).length;
      const conversionRate = totalTrials > 0 ? (convertedTrials / totalTrials) * 100 : 0;
      
      // Inserir para cada tenant (ou criar uma métrica global)
      for (const tenant of tenants) {
        const tenantTrial = tenantTrials.get(tenant.id);
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'trial_conversion_rate',
          period: 'all_time',
          metric_data: {
            had_trial: tenantTrial?.hadTrial || false,
            converted_from_trial: tenantTrial?.converted || false,
            platform_trial_conversion_rate: conversionRate,
            total_platform_trials: totalTrials,
            converted_platform_trials: convertedTrials,
            calculated_at: new Date().toISOString()
          }
        });
      }
      
      console.log(`   ✅ Taxa de conversão global: ${conversionRate.toFixed(2)}%`);
    }
  } catch (error) {
    console.log(`   ❌ Erro no Trial Conversion Rate: ${error.message}`);
  }
}

async function implementExternalAppointmentRatio(tenants) {
  for (const tenant of tenants) {
    try {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('appointment_data')
        .eq('tenant_id', tenant.id)
        .not('appointment_data', 'is', null);
      
      if (appointments && appointments.length > 0) {
        const sources = {
          platform: 0,
          external: 0,
          manual: 0,
          unknown: 0
        };
        
        appointments.forEach(apt => {
          const source = apt.appointment_data?.source;
          if (source === 'whatsapp_conversation') sources.platform++;
          else if (source === 'google_calendar') sources.external++;
          else if (source === 'whatsapp') sources.manual++;
          else sources.unknown++;
        });
        
        const total = appointments.length;
        const externalRatio = total > 0 ? (sources.external / total) * 100 : 0;
        const platformRatio = total > 0 ? (sources.platform / total) * 100 : 0;
        const riskLevel = externalRatio > 35 ? 'high' : externalRatio > 20 ? 'medium' : 'low';
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'external_appointment_ratio',
          period: '30d',
          metric_data: {
            total_appointments: total,
            external_appointments: sources.external,
            platform_appointments: sources.platform,
            manual_appointments: sources.manual,
            external_ratio_pct: externalRatio,
            platform_ratio_pct: platformRatio,
            external_platform_ratio: sources.platform > 0 ? sources.external / sources.platform : 0,
            risk_level: riskLevel,
            period_days: 30,
            calculated_at: new Date().toISOString()
          }
        });
        
        console.log(`   ✅ ${tenant.business_name}: ${externalRatio.toFixed(2)}% externos (${riskLevel} risk)`);
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

async function implementWhatsAppQualityScore(tenants) {
  for (const tenant of tenants) {
    try {
      const { data: conversations } = await supabase
        .from('conversation_history')
        .select('conversation_context, conversation_outcome')
        .eq('tenant_id', tenant.id)
        .not('conversation_context->session_id', 'is', null);
      
      if (conversations && conversations.length > 0) {
        const sessions = new Map();
        conversations.forEach(conv => {
          const sessionId = conv.conversation_context?.session_id;
          if (sessionId && !sessions.has(sessionId)) {
            sessions.set(sessionId, {
              outcome: conv.conversation_outcome,
              positive: ['appointment_created', 'info_request_fulfilled'].includes(conv.conversation_outcome),
              negative: ['appointment_cancelled', 'price_inquiry'].includes(conv.conversation_outcome)
            });
          }
        });
        
        const totalSessions = sessions.size;
        const positiveSessions = Array.from(sessions.values()).filter(s => s.positive).length;
        const negativeSessions = Array.from(sessions.values()).filter(s => s.negative).length;
        const spamSessions = totalSessions - positiveSessions - negativeSessions;
        
        const qualityScore = totalSessions > 0 ? (positiveSessions / totalSessions) * 100 : 0;
        const spamRate = totalSessions > 0 ? (spamSessions / totalSessions) * 100 : 0;
        const engagementRate = totalSessions > 0 ? ((totalSessions - spamSessions) / totalSessions) * 100 : 0;
        
        const qualityLevel = qualityScore >= 70 ? 'excellent' : 
                           qualityScore >= 50 ? 'good' : 
                           qualityScore >= 30 ? 'regular' : 'poor';
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'whatsapp_quality_score',
          period: '30d',
          metric_data: {
            total_conversations: totalSessions,
            positive_conversations: positiveSessions,
            negative_conversations: negativeSessions,
            spam_conversations: spamSessions,
            quality_score_pct: qualityScore,
            spam_rate_pct: spamRate,
            engagement_rate_pct: engagementRate,
            quality_level: qualityLevel,
            period_days: 30,
            calculated_at: new Date().toISOString()
          }
        });
        
        console.log(`   ✅ ${tenant.business_name}: ${qualityScore.toFixed(2)}% qualidade (${qualityLevel})`);
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

async function implementAIQualityScore(tenants) {
  for (const tenant of tenants) {
    try {
      const { data: messages } = await supabase
        .from('conversation_history')
        .select('confidence_score, is_from_user')
        .eq('tenant_id', tenant.id)
        .not('confidence_score', 'is', null)
        .eq('is_from_user', false); // Apenas mensagens do bot
      
      if (messages && messages.length > 0) {
        const avgConfidence = messages.reduce((sum, msg) => sum + msg.confidence_score, 0) / messages.length;
        const excellentResponses = messages.filter(msg => msg.confidence_score >= 0.9).length;
        const goodResponses = messages.filter(msg => msg.confidence_score >= 0.8 && msg.confidence_score < 0.9).length;
        const regularResponses = messages.filter(msg => msg.confidence_score >= 0.7 && msg.confidence_score < 0.8).length;
        const poorResponses = messages.filter(msg => msg.confidence_score < 0.7).length;
        
        const aiQualityPct = (messages.filter(msg => msg.confidence_score >= 0.8).length / messages.length) * 100;
        const performanceLevel = avgConfidence >= 0.95 ? 'excellent' :
                               avgConfidence >= 0.90 ? 'good' :
                               avgConfidence >= 0.80 ? 'regular' : 'needs_adjustment';
        
        await supabase.from('tenant_metrics').insert({
          tenant_id: tenant.id,
          metric_type: 'ai_quality_score',
          period: '30d',
          metric_data: {
            total_ai_interactions: messages.length,
            avg_confidence_score: avgConfidence,
            ai_quality_pct: aiQualityPct,
            excellent_responses: excellentResponses,
            good_responses: goodResponses,
            regular_responses: regularResponses,
            poor_responses: poorResponses,
            performance_level: performanceLevel,
            domain: tenant.domain,
            period_days: 30,
            calculated_at: new Date().toISOString()
          }
        });
        
        console.log(`   ✅ ${tenant.business_name}: ${(avgConfidence * 100).toFixed(2)}% IA confidence (${performanceLevel})`);
      }
    } catch (error) {
      console.log(`   ❌ Erro em ${tenant.business_name}: ${error.message}`);
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  implementCriticalMetrics()
    .then(results => {
      console.log('\n🎉 IMPLEMENTAÇÃO CONCLUÍDA COM SUCESSO!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 FALHA NA IMPLEMENTAÇÃO:', error);
      process.exit(1);
    });
}

module.exports = { implementCriticalMetrics };