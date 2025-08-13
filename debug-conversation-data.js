/**
 * Debug para verificar estrutura da tabela conversation_history
 * e encontrar o campo correto de data/tempo
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugConversationData() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔍 DEBUG: Estrutura conversation_history');
    console.log('=======================================\n');
    
    try {
        // 1. Pegar um tenant de teste
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .limit(1);
            
        const testTenant = tenants[0];
        console.log(`📍 Tenant teste: ${testTenant.business_name}`);
        
        // 2. Ver estrutura da tabela conversation_history
        console.log('\n📊 Primeiros registros conversation_history:');
        const { data: conversations } = await client
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', testTenant.id)
            .limit(3);
            
        if (conversations && conversations.length > 0) {
            const sample = conversations[0];
            console.log('Colunas disponíveis:', Object.keys(sample));
            console.log('\nSample record:');
            console.log('- conversation_id:', sample.conversation_id);
            console.log('- created_at:', sample.created_at);
            console.log('- start_time:', sample.start_time);
            console.log('- end_time:', sample.end_time);
            console.log('- conversation_outcome:', sample.conversation_outcome);
            console.log('- total_minutes:', sample.total_minutes);
        } else {
            console.log('❌ Nenhuma conversa encontrada');
        }
        
        // 3. Verificar total de conversas por tenant
        console.log('\n📈 Total conversas por tenant:');
        for (const tenant of tenants.slice(0, 5)) {
            const { data: convCount } = await client
                .from('conversation_history')
                .select('count(*)')
                .eq('tenant_id', tenant.id);
                
            console.log(`   ${tenant.business_name}: ${convCount?.[0]?.count || 0} conversas`);
        }
        
        // 4. Verificar se tem dados com created_at recente
        console.log('\n📅 Conversas recentes (últimos 90 dias por created_at):');
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 90);
        
        const { data: recentConvs } = await client
            .from('conversation_history')
            .select('tenant_id, created_at, conversation_outcome')
            .eq('tenant_id', testTenant.id)
            .gte('created_at', startDate.toISOString())
            .limit(5);
            
        console.log(`   Conversas últimos 90d: ${recentConvs?.length || 0}`);
        recentConvs?.forEach((conv, i) => {
            console.log(`   ${i+1}. ${new Date(conv.created_at).toLocaleString('pt-BR')} - ${conv.conversation_outcome}`);
        });
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
    }
}

debugConversationData().catch(console.error);