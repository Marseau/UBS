require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * CÓDIGO DEFINITIVO: Billing baseado no uso real mensal
 * 
 * Lógica correta:
 * 1. Free trial: 15 dias após criação
 * 2. Para cada mês: contar conversas DAQUELE MÊS
 * 3. Determinar plano mínimo necessário para aquele mês
 * 4. Cobrar valor correspondente
 */

function getMinimumPlan(conversationsInMonth) {
    if (conversationsInMonth <= 200) {
        return { plan: 'basico', limit: 200, price: 58.00 };
    } else if (conversationsInMonth <= 400) {
        return { plan: 'profissional', limit: 400, price: 116.00 };
    } else if (conversationsInMonth <= 1250) {
        return { plan: 'enterprise', limit: 1250, price: 290.00 };
    } else {
        // Enterprise + overage
        const overage = conversationsInMonth - 1250;
        return { 
            plan: 'enterprise', 
            limit: 1250, 
            price: 290.00 + (overage * 0.25),
            overage: overage 
        };
    }
}

async function populateBillingCorrect() {
    console.log('🚀 BILLING DEFINITIVO - USO REAL MENSAL');
    console.log('='.repeat(60));
    
    try {
        // Limpar dados antigos
        await supabase.from('conversation_billing').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('🗑️ Dados antigos limpos');
        
        // Buscar todos os tenants
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name, created_at');
        
        console.log(`🏢 Processando ${tenants.length} tenants\n`);
        
        for (const tenant of tenants) {
            console.log(`📋 ${tenant.name}`);
            console.log(`   📅 Criado: ${new Date(tenant.created_at).toLocaleDateString('pt-BR')}`);
            
            const tenantCreated = new Date(tenant.created_at);
            const freeTrialEnd = new Date(tenantCreated);
            freeTrialEnd.setDate(freeTrialEnd.getDate() + 15);
            
            console.log(`   🆓 Free trial até: ${freeTrialEnd.toLocaleDateString('pt-BR')}`);
            
            // Gerar meses desde criação até agosto 2025
            const currentDate = new Date('2025-08-31');
            let currentMonth = new Date(tenantCreated.getFullYear(), tenantCreated.getMonth(), 1);
            
            while (currentMonth <= currentDate) {
                const periodStart = new Date(currentMonth);
                const periodEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
                periodEnd.setHours(23, 59, 59, 999);
                
                // Verificar se está no free trial
                const isFreeTrial = periodEnd <= freeTrialEnd;
                
                // Calcular início real de cobrança (após free trial)
                let billingStart = periodStart;
                if (!isFreeTrial && periodStart < freeTrialEnd && periodEnd > freeTrialEnd) {
                    // Mês que contém o fim do free trial
                    billingStart = new Date(freeTrialEnd);
                    billingStart.setDate(billingStart.getDate() + 1); // Dia seguinte ao fim do trial
                }
                
                // Contar conversas do período de cobrança
                let conversationsUsed = 0;
                if (!isFreeTrial) {
                    const { data: conversations } = await supabase
                        .from('conversation_history')
                        .select('id')
                        .eq('tenant_id', tenant.id)
                        .eq('is_from_user', true)
                        .gte('created_at', billingStart.toISOString())
                        .lte('created_at', periodEnd.toISOString());
                    
                    conversationsUsed = conversations ? conversations.length : 0;
                }
                
                // Determinar plano e valor
                let totalAmount, baseAmount, overageAmount = 0;
                let planInfo;
                
                if (isFreeTrial) {
                    totalAmount = 0.00;
                    baseAmount = 0.00;
                    planInfo = { plan: 'free_trial', limit: 0, price: 0 };
                } else {
                    planInfo = getMinimumPlan(conversationsUsed);
                    baseAmount = planInfo.overage ? 290.00 : planInfo.price;
                    overageAmount = planInfo.overage ? planInfo.overage * 0.25 : 0;
                    totalAmount = baseAmount + overageAmount;
                }
                
                // Inserir registro
                const { error } = await supabase
                    .from('conversation_billing')
                    .insert({
                        tenant_id: tenant.id,
                        billing_period_start: periodStart.toISOString().split('T')[0],
                        billing_period_end: periodEnd.toISOString().split('T')[0],
                        conversations_included: planInfo.limit,
                        conversations_used: conversationsUsed,
                        conversations_overage: planInfo.overage || 0,
                        base_amount_brl: baseAmount,
                        overage_amount_brl: overageAmount,
                        total_amount_brl: totalAmount,
                        processed_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                
                if (error) {
                    console.log(`   ❌ Erro: ${error.message}`);
                } else {
                    const mes = periodStart.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    if (isFreeTrial) {
                        console.log(`   ✅ ${mes}: 🆓 FREE TRIAL (${conversationsUsed} conversas)`);
                    } else {
                        const overageText = planInfo.overage ? ` + ${planInfo.overage} excedentes` : '';
                        console.log(`   ✅ ${mes}: R$ ${totalAmount.toFixed(2)} (${conversationsUsed} conversas → ${planInfo.plan}${overageText})`);
                    }
                }
                
                currentMonth.setMonth(currentMonth.getMonth() + 1);
            }
            
            console.log('');
        }
        
        // Relatório final
        const { data: totalBilling } = await supabase
            .from('conversation_billing')
            .select('total_amount_brl');
        
        if (totalBilling) {
            const totalReceita = totalBilling.reduce((sum, b) => sum + parseFloat(b.total_amount_brl), 0);
            console.log('='.repeat(60));
            console.log('✅ BILLING DEFINITIVO CONCLUÍDO!');
            console.log(`💰 RECEITA TOTAL: R$ ${totalReceita.toFixed(2)}`);
            console.log(`📊 REGISTROS: ${totalBilling.length}`);
            console.log('='.repeat(60));
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

populateBillingCorrect().catch(console.error);