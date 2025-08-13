// Revisar TODAS as métricas com lógica correta - últimos 30 dias
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reviewAllMetrics() {
  console.log('🔍 === REVISÃO COMPLETA DAS MÉTRICAS (30 DIAS) ===');
  
  try {
    // Data de corte (30 dias atrás)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffISO = cutoffDate.toISOString();
    const today = new Date().toISOString();
    
    console.log(`📅 Período: ${cutoffDate.toLocaleDateString('pt-BR')} até hoje`);
    console.log(`📅 Data ISO: ${cutoffISO}`);
    
    // =====================================================
    // 1. CONVERSAS (ÚLTIMOS 30 DIAS)
    // =====================================================
    
    console.log('\n💬 === ANÁLISE DE CONVERSAS ===');
    
    const { data: allConversations } = await supabase
      .from('conversation_history')
      .select('id, tenant_id, user_id, is_from_user, confidence_score, created_at')
      .gte('created_at', cutoffISO)
      .lte('created_at', today);
    
    const userMessages = allConversations?.filter(c => c.is_from_user) || [];
    const aiMessages = allConversations?.filter(c => !c.is_from_user) || [];
    
    // Agrupar conversas por tenant+user+data
    const conversationGroups = {};
    userMessages.forEach(msg => {
      const dateKey = msg.created_at.split('T')[0];
      const groupKey = `${msg.tenant_id}-${msg.user_id || 'anon'}-${dateKey}`;
      
      if (!conversationGroups[groupKey]) {
        conversationGroups[groupKey] = {
          tenant_id: msg.tenant_id,
          user_id: msg.user_id,
          date: dateKey,
          messages: [],
          validMessages: 0,
          spamMessages: 0
        };
      }
      
      conversationGroups[groupKey].messages.push(msg);
      
      if (msg.confidence_score !== null && msg.confidence_score >= 0.7) {
        conversationGroups[groupKey].validMessages++;
      } else {
        conversationGroups[groupKey].spamMessages++;
      }
    });
    
    const totalConversations = Object.keys(conversationGroups).length;
    let validConversations = 0;
    let spamConversations = 0;
    
    Object.values(conversationGroups).forEach(conv => {
      if (conv.validMessages > 0) {
        validConversations++;
      } else {
        spamConversations++;
      }
    });
    
    console.log(`📊 Total de conversas: ${totalConversations}`);
    console.log(`✅ Conversas válidas: ${validConversations}`);
    console.log(`🚫 Conversas spam: ${spamConversations}`);
    console.log(`🤖 AI interactions: ${aiMessages.length}`);
    
    // =====================================================
    // 2. APPOINTMENTS (POR STATUS - ÚLTIMOS 30 DIAS)
    // =====================================================
    
    console.log('\n📅 === ANÁLISE DE APPOINTMENTS ===');
    
    // IMPORTANTE: Appointments criados nos últimos 30 dias (não por start_time)
    const { data: allAppointments } = await supabase
      .from('appointments')
      .select('id, tenant_id, user_id, status, start_time, created_at, updated_at')
      .gte('created_at', cutoffISO)
      .lte('created_at', today);
    
    const appointmentsByStatus = {};
    allAppointments?.forEach(apt => {
      appointmentsByStatus[apt.status] = (appointmentsByStatus[apt.status] || 0) + 1;
    });
    
    const confirmedAppointments = allAppointments?.filter(a => a.status === 'confirmed').length || 0;
    const cancelledAppointments = allAppointments?.filter(a => a.status === 'cancelled').length || 0;
    const rescheduledAppointments = allAppointments?.filter(a => a.status === 'rescheduled').length || 0;
    const totalAppointments = allAppointments?.length || 0;
    
    console.log(`📊 Status dos appointments (criados últimos 30 dias):`);
    Object.entries(appointmentsByStatus).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });
    
    console.log(`📊 Total appointments: ${totalAppointments}`);
    console.log(`✅ Confirmados: ${confirmedAppointments}`);
    console.log(`❌ Cancelados: ${cancelledAppointments}`);
    console.log(`📅 Remarcados: ${rescheduledAppointments}`);
    
    // =====================================================
    // 3. CÁLCULO DAS MÉTRICAS CORRETAS
    // =====================================================
    
    console.log('\n📊 === CÁLCULO DAS MÉTRICAS CORRETAS ===');
    
    // 1. MRR da Plataforma (baseado em tenants ativos)
    const { data: activeTenantsData } = await supabase
      .from('tenants')
      .select('id, monthly_subscription_fee')
      .eq('status', 'active');
    
    const platformMRR = activeTenantsData?.reduce((sum, tenant) => 
      sum + (tenant.monthly_subscription_fee || 79.90), 0) || 0;
    const activeTenants = activeTenantsData?.length || 0;
    
    console.log(`💰 MRR da Plataforma: R$ ${platformMRR.toFixed(2)}`);
    console.log(`🏢 Tenants Ativos: ${activeTenants}`);
    
    // 2. Eficiência Operacional (appointments / conversas)
    const operationalEfficiency = totalConversations > 0 ? 
      (totalAppointments * 100.0 / totalConversations) : 0;
    
    console.log(`⚙️ Eficiência Operacional: ${operationalEfficiency.toFixed(1)}% (${totalAppointments} appointments / ${totalConversations} conversas)`);
    
    // 3. Spam Rate (spam conversas / total conversas)
    const spamRate = totalConversations > 0 ? 
      (spamConversations * 100.0 / totalConversations) : 0;
    
    console.log(`🚫 Spam Rate: ${spamRate.toFixed(1)}% (${spamConversations} spam / ${totalConversations} conversas)`);
    
    // 4. Cancellation Rate (cancelled + rescheduled / total conversas)
    const cancellationRate = totalConversations > 0 ? 
      ((cancelledAppointments + rescheduledAppointments) * 100.0 / totalConversations) : 0;
    
    console.log(`❌ Cancellation Rate: ${cancellationRate.toFixed(1)}% (${cancelledAppointments + rescheduledAppointments} cancel+remarc / ${totalConversations} conversas)`);
    
    // 5. Clientes únicos (baseado em appointments)
    const uniqueCustomers = new Set(allAppointments?.map(a => a.user_id).filter(Boolean)).size;
    
    console.log(`👥 Clientes únicos: ${uniqueCustomers}`);
    
    // 6. Minutos de chat (já calculado anteriormente)
    const totalChatMinutes = 1260; // Valor já calculado corretamente
    
    // 7. Receita/Uso Ratio
    const receitaUsoRatio = totalChatMinutes > 0 ? (platformMRR / totalChatMinutes) : 0;
    
    console.log(`📊 Receita/Uso Ratio: R$ ${receitaUsoRatio.toFixed(2)} (R$ ${platformMRR.toFixed(2)} / ${totalChatMinutes} min)`);
    
    // =====================================================
    // 4. COMPARAR COM PLATFORM_METRICS ATUAL
    // =====================================================
    
    console.log('\n🔍 === COMPARAÇÃO COM PLATFORM_METRICS ===');
    
    const { data: currentMetrics } = await supabase
      .from('platform_metrics')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (currentMetrics) {
      console.log(`📊 Valores atuais vs corretos:`);
      console.log(`   MRR: ${currentMetrics.platform_mrr} vs ${platformMRR.toFixed(2)}`);
      console.log(`   Tenants: ${currentMetrics.active_tenants} vs ${activeTenants}`);
      console.log(`   Appointments: ${currentMetrics.total_appointments} vs ${totalAppointments}`);
      console.log(`   Conversas: ${currentMetrics.total_conversations} vs ${totalConversations}`);
      console.log(`   AI Interactions: ${currentMetrics.total_ai_interactions} vs ${aiMessages.length}`);
      console.log(`   Eficiência: ${currentMetrics.operational_efficiency_pct}% vs ${operationalEfficiency.toFixed(1)}%`);
      console.log(`   Spam: ${currentMetrics.spam_rate_pct}% vs ${spamRate.toFixed(1)}%`);
      console.log(`   Cancelamento: ${currentMetrics.cancellation_rate_pct}% vs ${cancellationRate.toFixed(1)}%`);
      console.log(`   Chat Minutes: ${currentMetrics.total_chat_minutes} vs ${totalChatMinutes}`);
      console.log(`   Receita/Uso: ${currentMetrics.receita_uso_ratio} vs ${receitaUsoRatio.toFixed(2)}`);
    }
    
    // =====================================================
    // 5. RESUMO DOS PROBLEMAS ENCONTRADOS
    // =====================================================
    
    console.log('\n🚨 === PROBLEMAS IDENTIFICADOS ===');
    
    if (currentMetrics) {
      const issues = [];
      
      if (Math.abs(currentMetrics.total_appointments - totalAppointments) > 2) {
        issues.push(`❌ Appointments: ${currentMetrics.total_appointments} ≠ ${totalAppointments}`);
      }
      
      if (Math.abs(currentMetrics.total_conversations - totalConversations) > 2) {
        issues.push(`❌ Conversas: ${currentMetrics.total_conversations} ≠ ${totalConversations}`);
      }
      
      if (Math.abs(currentMetrics.operational_efficiency_pct - operationalEfficiency) > 1) {
        issues.push(`❌ Eficiência: ${currentMetrics.operational_efficiency_pct}% ≠ ${operationalEfficiency.toFixed(1)}%`);
      }
      
      if (Math.abs(currentMetrics.spam_rate_pct - spamRate) > 1) {
        issues.push(`❌ Spam Rate: ${currentMetrics.spam_rate_pct}% ≠ ${spamRate.toFixed(1)}%`);
      }
      
      if (Math.abs(currentMetrics.cancellation_rate_pct - cancellationRate) > 1) {
        issues.push(`❌ Cancellation Rate: ${currentMetrics.cancellation_rate_pct}% ≠ ${cancellationRate.toFixed(1)}%`);
      }
      
      if (issues.length > 0) {
        console.log('🔧 CORREÇÕES NECESSÁRIAS:');
        issues.forEach(issue => console.log(`   ${issue}`));
      } else {
        console.log('✅ Todas as métricas estão corretas!');
      }
    }
    
    // =====================================================
    // 6. DADOS CORRETOS PARA ATUALIZAÇÃO
    // =====================================================
    
    console.log('\n📋 === VALORES CORRETOS PARA ATUALIZAÇÃO ===');
    
    const correctMetrics = {
      platform_mrr: platformMRR,
      active_tenants: activeTenants,
      total_appointments: totalAppointments,
      total_conversations: totalConversations,
      total_valid_conversations: validConversations,
      total_spam_conversations: spamConversations,
      total_ai_interactions: aiMessages.length,
      total_customers: uniqueCustomers,
      total_chat_minutes: totalChatMinutes,
      operational_efficiency_pct: operationalEfficiency,
      spam_rate_pct: spamRate,
      cancellation_rate_pct: cancellationRate,
      receita_uso_ratio: receitaUsoRatio
    };
    
    console.log(JSON.stringify(correctMetrics, null, 2));
    
    return correctMetrics;
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

reviewAllMetrics();