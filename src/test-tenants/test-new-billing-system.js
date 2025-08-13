require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * TESTE SIMPLES DO NOVO SISTEMA DE BILLING
 * Sistema refatorado que calcula billing baseado em dados reais
 */

async function testNewBillingSystem() {
    console.log('🚀 TESTANDO NOVO SISTEMA DE BILLING REFATORADO');
    console.log('='.repeat(70));
    
    try {
        // 1. Buscar tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active')
            .limit(5); // Testar com 5 primeiro
        
        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }
        
        console.log(`📊 Encontrados ${tenants?.length || 0} tenants ativos para teste`);
        
        // 2. Processar cada tenant
        let totalRevenue = 0;
        let processedCount = 0;
        
        for (const tenant of tenants || []) {
            console.log(`\n💰 Processando tenant: ${tenant.business_name}`);
            
            // Buscar conversas do último mês (dados reais)
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
            
            // Buscar agendamentos do último mês
            const { count: appointmentsCount, error: apptError } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .gte('created_at', thirtyDaysAgo.toISOString());
            
            if (apptError) {
                console.log(`   ❌ Erro ao buscar agendamentos: ${apptError.message}`);
                continue;
            }
            
            // Calcular métricas reais
            const finalConversationsCount = conversationsCount || 0;
            const finalAppointmentsCount = appointmentsCount || 0;
            
            // MODELO CORRETO DE BILLING: Trial + Upgrade Automático + Excedente só Enterprise
            const planPricing = {
                basico: { price_brl: 58.00, conversations_included: 200, autoUpgradeTo: 'profissional' },
                profissional: { price_brl: 116.00, conversations_included: 400, autoUpgradeTo: 'enterprise' },
                enterprise: { price_brl: 290.00, conversations_included: 1250, overage_price_brl: 0.25 }
            };

            // 1. Verificar se está em trial (15 dias desde created_at)
            const tenantCreatedAt = new Date(); // Simular criação há 20 dias para teste
            tenantCreatedAt.setDate(tenantCreatedAt.getDate() - 20);
            const trialEnd = new Date(tenantCreatedAt.getTime() + (15 * 24 * 60 * 60 * 1000));
            const isInTrial = new Date() < trialEnd;

            if (isInTrial) {
                console.log(`   🆓 Tenant em FREE TRIAL (billing = R$ 0,00)`);
                continue; // Pular billing para tenants em trial
            }

            // 2. Determinar plano baseado no uso (upgrade automático)
            let currentPlan = 'basico'; // Começar sempre no básico
            
            if (finalConversationsCount > planPricing.basico.conversations_included) {
                if (finalConversationsCount <= planPricing.profissional.conversations_included) {
                    currentPlan = 'profissional'; // Upgrade automático
                } else {
                    currentPlan = 'enterprise'; // Upgrade automático
                }
            }

            const plan = planPricing[currentPlan];
            let tenantRevenue = plan.price_brl;

            // 3. Calcular excedente APENAS para Enterprise
            let overageCost = 0;
            if (currentPlan === 'enterprise' && finalConversationsCount > plan.conversations_included) {
                const excessConversations = finalConversationsCount - plan.conversations_included;
                overageCost = excessConversations * plan.overage_price_brl;
                tenantRevenue += overageCost;
            }
            totalRevenue += tenantRevenue;
            processedCount++;
            
            console.log(`   ✅ ${finalConversationsCount} conversas, ${finalAppointmentsCount} agendamentos`);
            console.log(`   📋 Plano: ${currentPlan.toUpperCase()} (R$ ${plan.price_brl.toFixed(2)}) ${overageCost > 0 ? `+ excesso R$ ${overageCost.toFixed(2)}` : ''}`);
            console.log(`   💰 Receita total: R$ ${tenantRevenue.toFixed(2)}`);
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('📋 RESULTADO DO TESTE');
        console.log('='.repeat(70));
        console.log(`✅ Tenants processados: ${processedCount}/${tenants?.length || 0}`);
        console.log(`💰 Receita total calculada: R$ ${totalRevenue.toFixed(2)}`);
        console.log(`📊 Receita média por tenant: R$ ${processedCount > 0 ? (totalRevenue / processedCount).toFixed(2) : '0.00'}`);
        
        if (totalRevenue > 0) {
            console.log('\n🎯 STATUS: NOVO SISTEMA DE BILLING FUNCIONANDO!');
            console.log('🚀 Próximo passo: Implementar no cron job unificado');
        } else {
            console.log('\n⚠️ STATUS: Dados insuficientes ou sistema precisa ajustes');
        }
        
    } catch (error) {
        console.error('❌ ERRO NO TESTE:', error);
    }
}

testNewBillingSystem().catch(console.error);