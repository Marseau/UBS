/**
 * CHECK TENANT METRICS PERIOD
 * Verificar exatamente qual período a tenant_metrics está usando
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkTenantMetricsPeriod() {
  console.log('📅 VERIFICANDO PERÍODO DA TENANT_METRICS');
  console.log('='.repeat(50));

  try {
    // 1. BUSCAR DADOS DA TENANT_METRICS
    console.log('\n📊 1. DADOS DA TENANT_METRICS:');
    const { data: tenantMetrics, error } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data, calculated_at, period')
      .eq('metric_type', 'billing_analysis')
      .limit(3);

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    console.log(`✅ Encontrados ${tenantMetrics?.length || 0} registros`);

    // 2. ANALISAR PERÍODO DE CADA REGISTRO
    tenantMetrics?.forEach((tenant, i) => {
      const data = tenant.metric_data;
      
      console.log(`\n🏢 TENANT ${i + 1}: ${data?.business_name || 'Unknown'}`);
      console.log(`   Calculated At: ${tenant.calculated_at}`);
      console.log(`   Period Field: ${tenant.period}`);
      console.log(`   Period Days (metric_data): ${data?.period_days}`);
      console.log(`   Billing Model: ${data?.billing_model}`);
      console.log(`   Calculated At (metric_data): ${data?.calculated_at}`);
    });

    // 3. CALCULAR PERÍODO EXATO BASEADO NO calculated_at
    if (tenantMetrics && tenantMetrics.length > 0) {
      const firstTenant = tenantMetrics[0];
      const calculatedAt = new Date(firstTenant.calculated_at);
      const periodDays = firstTenant.metric_data?.period_days || 30;
      
      console.log(`\n📅 3. CÁLCULO DO PERÍODO EXATO:`);
      console.log(`   Calculado em: ${calculatedAt.toISOString()}`);
      console.log(`   Período: ${periodDays} dias`);
      
      // Calcular data de início
      const startDate = new Date(calculatedAt);
      startDate.setDate(startDate.getDate() - periodDays);
      
      console.log(`   Data início: ${startDate.toISOString()}`);
      console.log(`   Data fim: ${calculatedAt.toISOString()}`);
      
      // Converter para formato brasileiro
      console.log(`\n   📅 PERÍODO EM FORMATO BRASILEIRO:`);
      console.log(`   De: ${startDate.toLocaleDateString('pt-BR')} ${startDate.toLocaleTimeString('pt-BR')}`);
      console.log(`   Até: ${calculatedAt.toLocaleDateString('pt-BR')} ${calculatedAt.toLocaleTimeString('pt-BR')}`);
      
      // 4. VERIFICAR CONVERSAS NESTE PERÍODO EXATO
      console.log(`\n🔍 4. VERIFICANDO CONVERSAS NO PERÍODO EXATO:`);
      
      const tenantId = firstTenant.tenant_id;
      const { data: conversations, error: convError } = await supabase
        .from('conversation_history')
        .select('id, conversation_outcome, created_at')
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lt('created_at', calculatedAt.toISOString());

      if (convError) {
        console.log(`   ❌ Erro: ${convError.message}`);
      } else {
        const realCount = conversations?.length || 0;
        const jobCount = firstTenant.metric_data?.total_conversations || 0;
        
        console.log(`   Conversas no período exato: ${realCount}`);
        console.log(`   Conversas no job: ${jobCount}`);
        console.log(`   Diferença: ${jobCount - realCount}`);
        
        if (conversations && conversations.length > 0) {
          console.log(`\n   📋 PRIMEIRAS 5 CONVERSAS:`);
          conversations.slice(0, 5).forEach((conv, i) => {
            const createdAt = new Date(conv.created_at);
            console.log(`   ${i + 1}. ${createdAt.toLocaleDateString('pt-BR')} ${createdAt.toLocaleTimeString('pt-BR')} - ${conv.conversation_outcome}`);
          });
        }
      }
    }

    // 5. COMPARAR COM PERÍODO "ÚLTIMOS 30 DIAS"
    console.log(`\n📅 5. COMPARAÇÃO COM "ÚLTIMOS 30 DIAS" (AGORA):`);
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    console.log(`   Agora: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`);
    console.log(`   30 dias atrás: ${thirtyDaysAgo.toLocaleDateString('pt-BR')} ${thirtyDaysAgo.toLocaleTimeString('pt-BR')}`);
    
    if (tenantMetrics && tenantMetrics.length > 0) {
      const tenantId = tenantMetrics[0].tenant_id;
      
      const { data: currentConversations } = await supabase
        .from('conversation_history')
        .select('id')
        .eq('tenant_id', tenantId)
        .not('conversation_outcome', 'is', null)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const currentCount = currentConversations?.length || 0;
      console.log(`   Conversas nos últimos 30 dias (agora): ${currentCount}`);
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📅 VERIFICAÇÃO DE PERÍODO CONCLUÍDA');
}

checkTenantMetricsPeriod();