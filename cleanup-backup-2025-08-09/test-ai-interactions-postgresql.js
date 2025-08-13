const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * TESTE DAS 3 MÉTRICAS AI INTERACTIONS - SIMULAÇÃO POSTGRESQL
 * 
 * Simula as PostgreSQL functions para AI Interaction Metrics:
 * 1. ai_interaction_7d - Mensagens AI em 7 dias
 * 2. ai_interaction_30d - Mensagens AI em 30 dias  
 * 3. ai_interaction_90d - Mensagens AI em 90 dias
 * 
 * Lógica: COUNT(*) WHERE is_from_user = false (mensagens do sistema/AI)
 */

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * LÓGICA GERAL: AI Interaction por período
 * Baseada exatamente nos scripts validados
 */
async function calculateAIInteraction(tenantId, periodDays) {
    console.log(`🤖 AI_INTERACTION_${periodDays}D para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Query EXATA dos scripts validados: COUNT mensagens onde is_from_user = false
        const { count: systemMessagesTotal, error } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_from_user', false)  // ✅ CHAVE: Mensagens AI/sistema
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        // Opcionalmente, contar sessões para contexto (método session-based)
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null);

        let conversationsCount = 0;
        if (!convError && conversations) {
            const sessions = new Set();
            conversations.forEach(conv => {
                const sessionId = conv.conversation_context?.session_id;
                if (sessionId) sessions.add(sessionId);
            });
            conversationsCount = sessions.size;
        }

        const result = {
            system_messages_total: systemMessagesTotal || 0,
            period_days: periodDays,
            conversations_count: conversationsCount
        };

        console.log(`   ✅ Mensagens AI: ${result.system_messages_total}`);
        console.log(`   💬 Conversas (sessões): ${result.conversations_count}`);
        
        return [result];
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * 1. AI_INTERACTION_7D - 7 dias
 */
async function calculateAIInteraction7d(tenantId) {
    return await calculateAIInteraction(tenantId, 7);
}

/**
 * 2. AI_INTERACTION_30D - 30 dias
 */
async function calculateAIInteraction30d(tenantId) {
    return await calculateAIInteraction(tenantId, 30);
}

/**
 * 3. AI_INTERACTION_90D - 90 dias
 */
async function calculateAIInteraction90d(tenantId) {
    return await calculateAIInteraction(tenantId, 90);
}

/**
 * Testar todas as 3 métricas AI Interactions
 */
async function testAIInteractionMetrics() {
    console.log('🧪 TESTANDO AI INTERACTION METRICS - 3 POSTGRESQL FUNCTIONS SIMULADAS');
    console.log('='.repeat(75));
    
    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';

    try {
        console.log(`\n🏢 TESTE TENANT: ${testTenantId.substring(0, 8)}`);
        console.log('-'.repeat(60));

        // Test 1: AI Interaction 7d
        console.log('\n🤖 1. AI_INTERACTION_7D');
        console.log('-'.repeat(40));
        const ai7dData = await calculateAIInteraction7d(testTenantId);

        // Test 2: AI Interaction 30d
        console.log('\n🤖 2. AI_INTERACTION_30D');
        console.log('-'.repeat(40));
        const ai30dData = await calculateAIInteraction30d(testTenantId);

        // Test 3: AI Interaction 90d
        console.log('\n🤖 3. AI_INTERACTION_90D');
        console.log('-'.repeat(40));
        const ai90dData = await calculateAIInteraction90d(testTenantId);

        // Summary
        console.log('\n' + '='.repeat(75));
        console.log('🎉 TESTE AI INTERACTION METRICS CONCLUÍDO');
        
        console.log('\n📊 RESUMO DAS 3 MÉTRICAS AI INTERACTIONS:');
        console.log(`🤖 AI Messages 7d: ${ai7dData[0]?.system_messages_total || 0}`);
        console.log(`🤖 AI Messages 30d: ${ai30dData[0]?.system_messages_total || 0}`);
        console.log(`🤖 AI Messages 90d: ${ai90dData[0]?.system_messages_total || 0}`);
        console.log(`💬 Conversas 7d: ${ai7dData[0]?.conversations_count || 0}`);
        console.log(`💬 Conversas 30d: ${ai30dData[0]?.conversations_count || 0}`);
        console.log(`💬 Conversas 90d: ${ai90dData[0]?.conversations_count || 0}`);
        
        console.log('\n✅ FUNÇÕES POSTGRESQL PRONTAS PARA CRIAÇÃO');
        console.log('   📋 Usa lógica simples: COUNT(*) WHERE is_from_user = false');
        console.log('   🔄 Retorna formato JSON: {system_messages_total, period_days}');
        console.log('   🛡️ Inclui isolamento por tenant_id');
        console.log('   ⚡ Método eficiente (não session-based complexo)');

        return {
            ai_7d: ai7dData[0],
            ai_30d: ai30dData[0],
            ai_90d: ai90dData[0]
        };

    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar teste
if (require.main === module) {
    testAIInteractionMetrics().then(() => {
        console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO');
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = {
    calculateAIInteraction7d,
    calculateAIInteraction30d,
    calculateAIInteraction90d
};