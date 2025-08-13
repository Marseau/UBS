#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA INFORMATION_RATE
 * 
 * Testa o cálculo da taxa de conversas puramente informacionais
 * baseado em conversation_outcome específicos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular information_rate para um tenant e período
 */
async function calculateInformationRate(tenantId, periodDays) {
    console.log(`💬 Testando INFORMATION_RATE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Definir ENUMs conforme implementação atual
        const INFORMATION_OUTCOMES = [
            'info_request_fulfilled', 
            'business_hours_inquiry', 
            'price_inquiry', 
            'location_inquiry', 
            'appointment_inquiry'
        ];
        
        // Buscar todas as conversas do período com outcomes
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                conversation_outcome,
                conversation_context,
                created_at
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null)
            .not('conversation_outcome', 'is', null);
        
        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }
        
        if (!conversations || conversations.length === 0) {
            console.log(`   📭 Nenhuma conversa encontrada para o período`);
            return {
                information_percentage: 0,
                info_conversations: 0,
                total_conversations: 0,
                outcomes_distribution: {}
            };
        }
        
        // Agrupar por session_id usando data de início da conversa
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            if (!sessionMap.has(sessionId)) {
                // Primeira mensagem da sessão
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    final_outcome: conv.conversation_outcome
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Usar data de início da conversa (primeira mensagem)
                if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = conv.created_at;
                }
                // Atualizar outcome final (última mensagem com outcome)
                if (conv.conversation_outcome) {
                    session.final_outcome = conv.conversation_outcome;
                }
            }
        }
        
        // Filtrar sessões que iniciaram no período correto
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && sessionStart <= endDate;
        });
        
        console.log(`   💬 Total de sessões únicas encontradas: ${validSessions.length}`);
        
        // Contar conversas informacionais
        const informationSessions = validSessions.filter(session =>
            INFORMATION_OUTCOMES.includes(session.final_outcome)
        );
        
        const totalSessions = validSessions.length;
        const infoCount = informationSessions.length;
        const informationPercentage = totalSessions > 0 ? (infoCount / totalSessions) * 100 : 0;
        
        // Análise detalhada dos outcomes
        const outcomesDistribution = {};
        validSessions.forEach(session => {
            const outcome = session.final_outcome;
            outcomesDistribution[outcome] = (outcomesDistribution[outcome] || 0) + 1;
        });
        
        console.log(`   📊 Distribuição de outcomes:`)
        Object.entries(outcomesDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([outcome, count]) => {
                const isInfo = INFORMATION_OUTCOMES.includes(outcome);
                const symbol = isInfo ? '💬' : '⚪';
                const percentage = (count / totalSessions * 100).toFixed(1);
                console.log(`      ${symbol} ${outcome}: ${count} (${percentage}%)`);
            });
        
        // Detalhar especificamente outcomes informacionais
        console.log(`   💬 Breakdown outcomes informacionais:`);
        informationSessions.forEach(session => {
            console.log(`      📝 ${session.final_outcome}`);
        });
        
        const result = {
            information_percentage: Math.round(informationPercentage * 100) / 100,
            info_conversations: infoCount,
            total_conversations: totalSessions,
            outcomes_distribution: outcomesDistribution
        };
        
        console.log(`   ✅ Resultado: ${infoCount}/${totalSessions} = ${informationPercentage.toFixed(2)}% informacionais`);
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Testar múltiplos tenants e períodos
 */
async function runTests() {
    console.log('🧪 TESTE DA MÉTRICA INFORMATION_RATE');
    console.log('='.repeat(60));
    
    try {
        // Buscar tenants ativos para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        console.log('');
        
        // Testar cada tenant com diferentes períodos
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            for (const periodDays of periods) {
                try {
                    const result = await calculateInformationRate(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Conversas informacionais: ${result.info_conversations}/${result.total_conversations}`);
                    console.log(`      Taxa informacional: ${result.information_percentage}%`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n📋 OUTCOMES INFORMACIONAIS TESTADOS:');
        console.log('   💬 info_request_fulfilled - Pedido de informação atendido');
        console.log('   💬 business_hours_inquiry - Consulta sobre horários');
        console.log('   💬 price_inquiry - Consulta sobre preços');
        console.log('   💬 location_inquiry - Consulta sobre localização');
        console.log('   💬 appointment_inquiry - Consulta sobre agendamentos');
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateInformationRate };