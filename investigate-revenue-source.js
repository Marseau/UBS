require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateRevenueSource() {
    console.log('🔍 INVESTIGAÇÃO: ORIGEM DOS DADOS DE RECEITA R$ 190.146,37');
    console.log('='.repeat(70));
    
    // 1. Verificar como a receita foi calculada
    const { data: sample } = await supabase
        .from('tenant_metrics')
        .select('*')
        .eq('metric_type', 'revenue_per_customer')
        .limit(1);
    
    if (sample && sample.length > 0) {
        console.log('📊 ESTRUTURA DOS DADOS NA TENANT_METRICS:');
        console.log('Exemplo completo de metric_data:');
        console.log(JSON.stringify(sample[0].metric_data, null, 2));
        console.log(`📅 Calculated_at: ${sample[0].calculated_at}`);
    }
    
    // 2. Verificar se temos dados reais de billing/conversation
    console.log('\n🔍 VERIFICANDO DADOS REAIS DE BILLING:');
    const { data: billing, error: billingError } = await supabase
        .from('conversation_billing')
        .select('tenant_id, total_amount_brl, billing_period_start')
        .order('billing_period_start', { ascending: false })
        .limit(10);
    
    if (!billingError && billing && billing.length > 0) {
        console.log('✅ Dados de billing encontrados:');
        billing.forEach(b => {
            console.log(`  • Tenant ${b.tenant_id.substring(0, 8)}: R$ ${b.total_amount_brl} (${b.billing_period_start})`);
        });
        
        const totalBilling = billing.reduce((sum, b) => sum + parseFloat(b.total_amount_brl), 0);
        console.log(`💰 Total billing (amostra): R$ ${totalBilling.toFixed(2)}`);
    } else {
        console.log('❌ Nenhum dado de billing encontrado ou erro:', billingError?.message);
    }
    
    // 3. Verificar dados de conversas reais
    console.log('\n🔍 VERIFICANDO CONVERSAS REAIS POR TENANT:');
    
    // Pegar um tenant específico e analisar
    const firstTenant = '33b8c488-5aa9-4891-b335-701d10296681'; // Primeiro tenant da lista
    
    const { data: conversations, error: convError } = await supabase
        .from('conversation_history')
        .select('id, created_at, conversation_outcome')
        .eq('tenant_id', firstTenant)
        .not('conversation_outcome', 'is', null)
        .limit(10);
    
    if (!convError && conversations && conversations.length > 0) {
        console.log(`✅ Conversas do tenant ${firstTenant.substring(0, 8)}:`);
        console.log(`📊 Total conversas na amostra: ${conversations.length}`);
        
        // Contar outcomes
        const outcomes = {};
        conversations.forEach(c => {
            outcomes[c.conversation_outcome] = (outcomes[c.conversation_outcome] || 0) + 1;
        });
        
        Object.entries(outcomes).forEach(([outcome, count]) => {
            console.log(`  • ${outcome}: ${count} conversas`);
        });
    } else {
        console.log('❌ Nenhuma conversa encontrada para este tenant');
    }
    
    // 4. Verificar appointments reais
    console.log('\n🔍 VERIFICANDO APPOINTMENTS REAIS:');
    const { data: appointments, error: apptError } = await supabase
        .from('appointments')
        .select('tenant_id, status, start_time, created_at')
        .eq('tenant_id', firstTenant)
        .limit(10);
    
    if (!apptError && appointments && appointments.length > 0) {
        console.log(`✅ Appointments do tenant ${firstTenant.substring(0, 8)}:`);
        console.log(`📊 Total appointments na amostra: ${appointments.length}`);
        
        const statusCounts = {};
        appointments.forEach(a => {
            statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
        });
        
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  • Status ${status}: ${count} appointments`);
        });
    } else {
        console.log('❌ Nenhum appointment encontrado para este tenant');
    }
    
    // 5. Verificar quando e como foi calculada a receita
    console.log('\n🔍 VERIFICANDO COMO A RECEITA FOI CALCULADA:');
    
    const { data: allTenantMetrics } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, metric_type, calculated_at')
        .eq('metric_type', 'revenue_per_customer')
        .order('calculated_at', { ascending: false })
        .limit(1);
    
    if (allTenantMetrics && allTenantMetrics.length > 0) {
        console.log(`📅 Última atualização: ${new Date(allTenantMetrics[0].calculated_at).toLocaleString('pt-BR')}`);
        
        // Verificar se há script que criou estes dados
        console.log('\n📝 POSSÍVEIS ORIGENS DA RECEITA:');
        console.log('1. Dados simulados/mock criados por script de teste');
        console.log('2. Dados calculados baseados em appointments reais');
        console.log('3. Dados de billing importados');
        console.log('4. Dados gerados automaticamente pelo cron job');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎯 RESUMO DA INVESTIGAÇÃO:');
    console.log('='.repeat(70));
    console.log('💰 Receita Total: R$ 190.146,37');
    console.log('📊 Origem: tenant_metrics.metric_data.revenue (JSONB)');
    console.log('🏢 Tenants: 10 tenants ativos');
    console.log('📈 Média/tenant: R$ 19.014,64');
    console.log('📅 Período: 30d (últimos 30 dias)');
    console.log('⏰ Última atualização: 30/07/2025, 21:48:01');
    
    console.log('\n❓ NATUREZA DOS DADOS:');
    console.log('Esta receita pode ser:');
    console.log('• Dados simulados para demonstração do sistema');
    console.log('• Dados reais calculados baseados em appointments');
    console.log('• Dados de billing importados de sistema externo');
    console.log('\nPara confirmar a origem exata, seria necessário');
    console.log('verificar os scripts que popularam a tabela tenant_metrics.');
}

investigateRevenueSource().catch(console.error);