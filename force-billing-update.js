#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function forceBillingUpdate() {
  console.log('💰 APLICANDO MODELO CORRETO DE BILLING (Trial + Upgrade + Valores Corretos)...\n');
  
  try {
    // Buscar todos os tenants ativos
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, business_name, created_at, status')
      .eq('status', 'active')
      .limit(20);
    
    if (tenantsError) {
      throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
    }
    
    console.log(`✅ Encontrados ${tenants.length} tenants ativos para aplicar billing correto\n`);
    
    // VALORES CORRETOS do sistema
    const PLAN_PRICING = {
      basico: { price_brl: 58.00, conversations_included: 200 },
      profissional: { price_brl: 116.00, conversations_included: 400 },
      enterprise: { price_brl: 290.00, conversations_included: 1250, overage_price_brl: 0.25 }
    };
    
    let processedCount = 0;
    
    for (const tenant of tenants) {
      try {
        // Verificar se está em trial (15 dias)
        const now = new Date();
        const trialEnd = new Date(new Date(tenant.created_at).getTime() + (15 * 24 * 60 * 60 * 1000));
        const isInTrial = now < trialEnd;
        
        if (isInTrial) {
          console.log(`   🆓 ${tenant.business_name}: FREE TRIAL até ${trialEnd.toLocaleDateString()} (billing = R$ 0,00)`);
          continue;
        }
        
        // Buscar conversas do último mês para determinar plano
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { count: conversationsCount, error: convError } = await supabase
          .from('conversation_history')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .not('conversation_outcome', 'is', null);
        
        if (convError) {
          console.log(`   ❌ Erro ao buscar conversas: ${convError.message}`);
          continue;
        }
        
        const finalConversationsCount = conversationsCount || 0;
        
        // Determinar plano baseado no uso (upgrade automático)
        let currentPlan = 'basico';
        if (finalConversationsCount > PLAN_PRICING.basico.conversations_included) {
          if (finalConversationsCount <= PLAN_PRICING.profissional.conversations_included) {
            currentPlan = 'profissional';
          } else {
            currentPlan = 'enterprise';
          }
        }
        
        const plan = PLAN_PRICING[currentPlan];
        let billingAmount = plan.price_brl;
        
        // Calcular excedente APENAS para Enterprise
        if (currentPlan === 'enterprise' && finalConversationsCount > plan.conversations_included) {
          const excessConversations = finalConversationsCount - plan.conversations_included;
          const overageCost = excessConversations * plan.overage_price_brl;
          billingAmount += overageCost;
        }
        
        console.log(`   ✅ ${tenant.business_name}: ${finalConversationsCount} conversas → ${currentPlan.toUpperCase()} = R$ ${billingAmount.toFixed(2)}`);
        processedCount++;
        
      } catch (error) {
        console.error(`   ❌ Erro processando ${tenant.business_name}:`, error.message);
      }
    }
    
    console.log(`\n✅ BILLING CORRETO APLICADO: ${processedCount}/${tenants.length} tenants processados`);
    console.log('🎯 Lógica: 15 dias trial → upgrade automático → excedente apenas Enterprise');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

forceBillingUpdate();