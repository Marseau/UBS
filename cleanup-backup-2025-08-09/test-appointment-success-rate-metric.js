#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA APPOINTMENT_SUCCESS_RATE
 * 
 * Testa o cálculo da taxa de sucesso de agendamentos baseado em conversation_outcome
 * usando conversation_history agrupado por session_id
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular appointment_success_rate para um tenant e período
 */
async function calculateAppointmentSuccessRate(tenantId, periodDays) {
    console.log(`📊 Testando APPOINTMENT_SUCCESS_RATE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Definir os ENUMs conforme identificados
        const SUCCESS_OUTCOMES = ['appointment_created', 'appointment_confirmed'];
        const EXCLUDED_OUTCOMES = ['wrong_number', 'spam_detected', 'appointment_noshow_followup'];
        
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
                percentage: 0,
                completed: 0,
                total: 0
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
        
        // Filtrar sessões válidas (excluindo outcomes excluídos)
        const validConversations = validSessions.filter(session => 
            !EXCLUDED_OUTCOMES.includes(session.final_outcome)
        );
        
        // Contar sucessos
        const successfulConversations = validConversations.filter(session =>
            SUCCESS_OUTCOMES.includes(session.final_outcome)
        );
        
        const totalValid = validConversations.length;
        const completed = successfulConversations.length;
        const percentage = totalValid > 0 ? (completed / totalValid) * 100 : 0;
        
        // Análise detalhada dos outcomes
        const outcomeDistribution = {};
        validSessions.forEach(session => {
            const outcome = session.final_outcome;
            outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
        });
        
        console.log(`   📊 Distribuição de outcomes:`);
        Object.entries(outcomeDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([outcome, count]) => {
                const isSuccess = SUCCESS_OUTCOMES.includes(outcome);
                const isExcluded = EXCLUDED_OUTCOMES.includes(outcome);
                const symbol = isSuccess ? '✅' : isExcluded ? '🚫' : '⚪';
                console.log(`      ${symbol} ${outcome}: ${count}`);
            });
        
        const result = {
            percentage: Math.round(percentage * 100) / 100,
            completed: completed,
            total: totalValid
        };
        
        console.log(`   ✅ Resultado: ${completed}/${totalValid} = ${percentage.toFixed(2)}% de sucesso`);
        
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
    console.log('🧪 TESTE DA MÉTRICA APPOINTMENT_SUCCESS_RATE');
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
            console.log('-'.repeat(50));
            
            for (const periodDays of periods) {
                try {
                    await calculateAppointmentSuccessRate(tenant.id, periodDays);
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        
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

module.exports = { calculateAppointmentSuccessRate };