require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Popular billing retroativo baseado na data de criação do tenant
 * Considera que o plano começou quando o tenant foi criado
 */
async function populateBillingRetroactive() {
    console.log('🚀 POPULANDO BILLING RETROATIVO - BASEADO NA DATA DE CRIAÇÃO');
    console.log('='.repeat(70));
    
    try {
        // 1. Buscar todos os tenants com data de criação
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select(`
                id,
                name,
                conversation_plan,
                max_conversations,
                created_at
            `);
        
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        console.log(`🏢 Encontrados ${tenants.length} tenants para processar`);
        
        // 2. Para cada tenant, criar registros de billing desde a criação
        for (const tenant of tenants) {
            console.log(`\n📋 Processando: ${tenant.name}`);
            console.log(`   📅 Criado em: ${new Date(tenant.created_at).toLocaleDateString('pt-BR')}`);
            console.log(`   📦 Plano: ${tenant.conversation_plan} (${tenant.max_conversations} conversas)`);
            
            const tenantCreated = new Date(tenant.created_at);
            const currentDate = new Date();
            
            // Calcular fim do free trial (15 dias após criação)
            const freeTrialEnd = new Date(tenantCreated);
            freeTrialEnd.setDate(freeTrialEnd.getDate() + 15);
            
            console.log(`   🆓 Free trial até: ${freeTrialEnd.toLocaleDateString('pt-BR')}`);
            
            // Gerar meses desde a criação até hoje
            const billingPeriods = [];
            let currentMonth = new Date(tenantCreated.getFullYear(), tenantCreated.getMonth(), 1);
            
            while (currentMonth <= currentDate) {
                const periodStart = new Date(currentMonth);
                const periodEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
                
                // Verificar se o período está no free trial
                const isFreeTrial = periodEnd <= freeTrialEnd;
                
                billingPeriods.push({
                    start: periodStart,
                    end: periodEnd,
                    isFreeTrial: isFreeTrial
                });
                
                currentMonth.setMonth(currentMonth.getMonth() + 1);
            }
            
            console.log(`   📊 Períodos de billing: ${billingPeriods.length} meses`);
            
            // 3. Para cada período, calcular billing
            for (const period of billingPeriods) {
                const { data: existingBilling } = await supabase
                    .from('conversation_billing')
                    .select('id')
                    .eq('tenant_id', tenant.id)
                    .eq('billing_period_start', period.start.toISOString().split('T')[0])
                    .limit(1);
                
                if (existingBilling && existingBilling.length > 0) {
                    console.log(`   ⏭️ Pulando ${period.start.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })} - já existe`);
                    continue;
                }
                
                // Contar conversas do período
                const { data: conversations, error: convError } = await supabase
                    .from('conversation_history')
                    .select('id')
                    .eq('tenant_id', tenant.id)
                    .eq('is_from_user', true)
                    .gte('created_at', period.start.toISOString())
                    .lte('created_at', period.end.toISOString());
                
                if (convError) {
                    console.error(`   ❌ Erro ao contar conversas:`, convError);
                    continue;
                }
                
                const conversationsUsed = conversations ? conversations.length : 0;
                const conversationsIncluded = tenant.max_conversations;
                const conversationsOverage = Math.max(0, conversationsUsed - conversationsIncluded);
                
                // Calcular valores (FREE TRIAL = R$ 0.00)
                let baseAmount, overageAmount, totalAmount;
                
                if (period.isFreeTrial) {
                    baseAmount = 0.00;
                    overageAmount = 0.00;
                    totalAmount = 0.00;
                } else {
                    baseAmount = tenant.conversation_plan === 'basico' ? 58.00 :
                               tenant.conversation_plan === 'profissional' ? 116.00 :
                               tenant.conversation_plan === 'enterprise' ? 290.00 : 58.00;
                    
                    overageAmount = tenant.conversation_plan === 'enterprise' ? 
                                  conversationsOverage * 0.25 : 0.00;
                    
                    totalAmount = baseAmount + overageAmount;
                }
                
                // Inserir registro
                const { error: insertError } = await supabase
                    .from('conversation_billing')
                    .insert({
                        tenant_id: tenant.id,
                        billing_period_start: period.start.toISOString().split('T')[0],
                        billing_period_end: period.end.toISOString().split('T')[0],
                        conversations_included: conversationsIncluded,
                        conversations_used: conversationsUsed,
                        conversations_overage: conversationsOverage,
                        base_amount_brl: baseAmount,
                        overage_amount_brl: overageAmount,
                        total_amount_brl: totalAmount,
                        processed_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                
                if (insertError) {
                    console.error(`   ❌ Erro ao inserir billing:`, insertError);
                } else {
                    const mes = period.start.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    const status = period.isFreeTrial ? '🆓 FREE TRIAL' : `R$ ${totalAmount.toFixed(2)}`;
                    console.log(`   ✅ ${mes}: ${status} (${conversationsUsed} conversas)`);
                }
            }
        }
        
        console.log('\n✅ BILLING RETROATIVO CONCLUÍDO!');
        console.log('='.repeat(70));
        
        // 4. Verificar resultado final
        const { data: totalBilling } = await supabase
            .from('conversation_billing')
            .select('total_amount_brl');
        
        if (totalBilling) {
            const totalReceita = totalBilling.reduce((sum, b) => sum + parseFloat(b.total_amount_brl), 0);
            console.log(`💰 RECEITA TOTAL GERADA: R$ ${totalReceita.toFixed(2)}`);
            console.log(`📊 REGISTROS DE BILLING: ${totalBilling.length}`);
        }
        
    } catch (error) {
        console.error('❌ Erro no processo:', error);
    }
}

populateBillingRetroactive().catch(console.error);