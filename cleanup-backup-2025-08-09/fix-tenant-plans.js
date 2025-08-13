require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixTenantPlans() {
    console.log('🔧 CORRIGINDO PLANOS DOS TENANTS BASEADO NO USO REAL');
    console.log('='.repeat(60));
    
    try {
        // 1. Buscar todos os tenants
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name, conversation_plan, max_conversations');
        
        for (const tenant of tenants) {
            console.log(`\n📋 Analisando: ${tenant.name}`);
            console.log(`   Plano atual: ${tenant.conversation_plan} (${tenant.max_conversations} conversas)`);
            
            // 2. Verificar uso máximo nos últimos 3 meses
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            
            const { data: conversations } = await supabase
                .rpc('get_monthly_conversation_usage', {
                    p_tenant_id: tenant.id,
                    p_months: 3
                });
            
            if (!conversations) {
                // Fallback: contar diretamente
                const { data: directCount } = await supabase
                    .from('conversation_history')
                    .select('id, created_at')
                    .eq('tenant_id', tenant.id)
                    .eq('is_from_user', true)
                    .gte('created_at', threeMonthsAgo.toISOString());
                
                const monthlyUsage = directCount ? directCount.length : 0;
                console.log(`   Uso real: ${monthlyUsage} conversas (3 meses)`);
                
                // Determinar plano correto
                let correctPlan, correctLimit;
                if (monthlyUsage <= 200) {
                    correctPlan = 'basico';
                    correctLimit = 200;
                } else if (monthlyUsage <= 400) {
                    correctPlan = 'profissional';
                    correctLimit = 400;
                } else {
                    correctPlan = 'enterprise';
                    correctLimit = 1250;
                }
                
                console.log(`   Plano correto: ${correctPlan} (${correctLimit} conversas)`);
                
                // Atualizar se necessário
                if (tenant.conversation_plan !== correctPlan) {
                    const { error } = await supabase
                        .from('tenants')
                        .update({
                            conversation_plan: correctPlan,
                            max_conversations: correctLimit,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', tenant.id);
                    
                    if (error) {
                        console.log(`   ❌ Erro ao atualizar: ${error.message}`);
                    } else {
                        console.log(`   ✅ CORRIGIDO: ${tenant.conversation_plan} → ${correctPlan}`);
                    }
                } else {
                    console.log(`   ✅ Plano já está correto`);
                }
            }
        }
        
        console.log('\n✅ CORREÇÃO DE PLANOS CONCLUÍDA!');
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

fixTenantPlans().catch(console.error);