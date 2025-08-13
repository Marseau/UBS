/**
 * MEMÓRIA DE CÁLCULO: Número de Conversas - Período 90d
 * Detalhamento completo do processo de contagem
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugConversationCalculation() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔍 MEMÓRIA DE CÁLCULO: Número de Conversas');
    console.log('==========================================\n');
    
    // Tenants para análise
    const targetTenants = [
        'Bella Vista Spa & Salon',
        'Centro Terapêutico Equilíbrio', 
        'Clínica Mente Sã'
    ];
    
    try {
        // 1. Buscar tenants
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .in('business_name', targetTenants);
        
        // 2. Período 90d
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 90);
        
        console.log(`📅 PERÍODO ANALISADO: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        console.log('=========================================================================\n');
        
        for (const tenant of tenants) {
            console.log(`🏢 TENANT: ${tenant.business_name}`);
            console.log(`📋 ID: ${tenant.id}`);
            console.log('─'.repeat(50));
            
            // PASSO 1: Query principal usada no script
            console.log('📊 PASSO 1: Query Principal');
            const { data: conversations, error } = await client
                .from('conversation_history')
                .select('user_id, conversation_outcome, created_at, confidence_score, intent_detected, id')
                .eq('tenant_id', tenant.id)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString())
                .order('created_at', { ascending: true });
            
            if (error) {
                console.log('❌ Erro na query:', error.message);
                continue;
            }
            
            console.log(`   ✅ Total registros encontrados: ${conversations?.length || 0}`);
            console.log(`   📅 Filtro: created_at ENTRE '${startDate.toISOString()}' E '${endDate.toISOString()}'`);
            console.log(`   🏢 Filtro: tenant_id = '${tenant.id}'`);
            
            if (!conversations || conversations.length === 0) {
                console.log('   ⚠️ Nenhuma conversa encontrada para este tenant no período\n');
                continue;
            }
            
            // PASSO 2: Análise temporal dos dados
            console.log('\n📈 PASSO 2: Distribuição Temporal');
            const conversationsByDate = {};
            conversations.forEach(conv => {
                const date = new Date(conv.created_at).toISOString().split('T')[0];
                conversationsByDate[date] = (conversationsByDate[date] || 0) + 1;
            });
            
            const dates = Object.keys(conversationsByDate).sort();
            console.log(`   📊 Período real dos dados: ${dates[0]} até ${dates[dates.length - 1]}`);
            console.log(`   📈 Dias com atividade: ${dates.length} dias`);
            console.log('   📅 Amostra de distribuição:');
            
            dates.slice(0, 5).forEach(date => {
                console.log(`      ${date}: ${conversationsByDate[date]} conversas`);
            });
            if (dates.length > 5) console.log(`      ... e mais ${dates.length - 5} dias`);
            
            // PASSO 3: Análise por user_id
            console.log('\n👥 PASSO 3: Análise por Usuário');
            const userConversations = {};
            conversations.forEach(conv => {
                if (!userConversations[conv.user_id]) {
                    userConversations[conv.user_id] = [];
                }
                userConversations[conv.user_id].push(conv);
            });
            
            const uniqueUsers = Object.keys(userConversations);
            console.log(`   👥 Usuários únicos: ${uniqueUsers.length}`);
            console.log(`   💬 Mensagens por usuário (média): ${(conversations.length / uniqueUsers.length).toFixed(1)}`);
            
            // Top 3 usuários mais ativos
            const userStats = uniqueUsers.map(userId => ({
                user_id: userId,
                messages: userConversations[userId].length,
                firstMessage: userConversations[userId][0].created_at,
                lastMessage: userConversations[userId][userConversations[userId].length - 1].created_at
            })).sort((a, b) => b.messages - a.messages);
            
            console.log('   🏆 Top 3 usuários mais ativos:');
            userStats.slice(0, 3).forEach((user, i) => {
                const duration = (new Date(user.lastMessage) - new Date(user.firstMessage)) / (1000 * 60);
                console.log(`      ${i+1}. User ${user.user_id.substring(0,8)}... - ${user.messages} mensagens (${duration.toFixed(1)} min)`);
            });
            
            // PASSO 4: Análise de outcomes
            console.log('\n🎯 PASSO 4: Análise de Outcomes');
            const outcomes = {};
            const intents = {};
            
            conversations.forEach(conv => {
                const outcome = conv.conversation_outcome || 'null';
                const intent = conv.intent_detected || 'null';
                outcomes[outcome] = (outcomes[outcome] || 0) + 1;
                intents[intent] = (intents[intent] || 0) + 1;
            });
            
            console.log('   📊 Distribuição por conversation_outcome:');
            Object.entries(outcomes).sort((a, b) => b[1] - a[1]).forEach(([outcome, count]) => {
                const percentage = ((count / conversations.length) * 100).toFixed(1);
                console.log(`      ${outcome}: ${count} (${percentage}%)`);
            });
            
            console.log('   🧠 Distribuição por intent_detected:');
            Object.entries(intents).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([intent, count]) => {
                const percentage = ((count / conversations.length) * 100).toFixed(1);
                console.log(`      ${intent}: ${count} (${percentage}%)`);
            });
            
            // PASSO 5: Cálculo final
            console.log('\n🧮 PASSO 5: Cálculo Final');
            const spamConversations = conversations.filter(c => 
                ['wrong_number', 'spam_detected'].includes(c.conversation_outcome || '') ||
                c.intent_detected === 'spam'
            );
            
            const infoConversations = conversations.filter(c => 
                c.conversation_outcome === 'information_request' || 
                c.conversation_outcome === 'price_inquiry' ||
                c.intent_detected === 'information'
            );
            
            console.log(`   📊 TOTAL DE CONVERSAS: ${conversations.length}`);
            console.log(`   🚫 Conversas Spam: ${spamConversations.length}`);
            console.log(`   ℹ️  Conversas Info: ${infoConversations.length}`);
            console.log(`   ✅ Conversas Válidas: ${conversations.length - spamConversations.length}`);
            
            console.log('\n' + '='.repeat(70) + '\n');
        }
        
        // PASSO 6: Verificação da query completa
        console.log('🔍 PASSO 6: Query SQL Equivalente');
        console.log('==================================');
        console.log(`
SELECT 
    COUNT(*) as total_conversations,
    tenant_id,
    COUNT(CASE WHEN conversation_outcome IN ('wrong_number', 'spam_detected') 
               OR intent_detected = 'spam' THEN 1 END) as spam_conversations,
    COUNT(CASE WHEN conversation_outcome IN ('information_request', 'price_inquiry') 
               OR intent_detected = 'information' THEN 1 END) as info_conversations
FROM conversation_history 
WHERE tenant_id IN ('${tenants.map(t => t.id).join("', '")}')
  AND created_at >= '${startDate.toISOString()}'
  AND created_at <= '${endDate.toISOString()}'
GROUP BY tenant_id;
        `);
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,5).join('\n'));
    }
}

debugConversationCalculation().catch(console.error);