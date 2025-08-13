require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getPaymentData() {
    // Buscar tenant com conversas
    const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name')
        .limit(5);
    
    for (const tenant of tenants) {
        const { data: conversations } = await supabase
            .from('conversation_history')
            .select('id')
            .eq('tenant_id', tenant.id)
            .limit(1);
            
        if (conversations?.length > 0) {
            console.log(`🏢 Tenant: ${tenant.name}`);
            
            // Buscar pagamentos dos últimos 6 meses
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            
            const { data: payments } = await supabase
                .from('conversation_billing')
                .select('*')
                .eq('tenant_id', tenant.id)
                .gte('billing_period_start', sixMonthsAgo.toISOString())
                .order('billing_period_start');
                
            if (payments?.length > 0) {
                console.log('💳 Pagamentos últimos 6 meses:');
                let total = 0;
                payments.forEach(p => {
                    const mes = new Date(p.billing_period_start).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    console.log(`   ${mes}: R$ ${p.total_amount_brl.toFixed(2)} (${p.conversations_used} conversas)`);
                    total += parseFloat(p.total_amount_brl);
                });
                console.log(`📊 TOTAL 6M: R$ ${total.toFixed(2)}`);
                return;
            } else {
                console.log('❌ Sem dados de billing para este tenant');
            }
        }
    }
    
    console.log('⚠️ Nenhum tenant tem dados de billing nos últimos 6 meses');
}

getPaymentData().catch(console.error);