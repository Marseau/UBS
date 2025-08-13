#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA RESCHEDULE_RATE
 * 
 * Testa o cálculo da taxa de remarcações/modificações de appointments
 * para análise de flexibilidade operacional e comportamento do cliente
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular reschedule_rate para um tenant e período
 */
async function calculateRescheduleRate(tenantId, periodDays) {
    console.log(`📅 Testando RESCHEDULE_RATE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Definir ENUMs conforme implementação atual
        const RESCHEDULE_OUTCOMES = [
            'appointment_rescheduled',  // Appointment foi remarcado para nova data/hora
            'appointment_modified'      // Appointment foi modificado (serviço, profissional, etc.)
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
                reschedule_percentage: 0,
                reschedule_conversations: 0,
                total_conversations: 0,
                outcomes_distribution: {},
                reschedule_breakdown: {}
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
        
        // Contar conversas de remarcação
        const rescheduleSessions = validSessions.filter(session =>
            RESCHEDULE_OUTCOMES.includes(session.final_outcome)
        );
        
        const totalSessions = validSessions.length;
        const rescheduleCount = rescheduleSessions.length;
        const reschedulePercentage = totalSessions > 0 ? (rescheduleCount / totalSessions) * 100 : 0;
        
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
                const isReschedule = RESCHEDULE_OUTCOMES.includes(outcome);
                const symbol = isReschedule ? '📅' : '⚪';
                const percentage = (count / totalSessions * 100).toFixed(1);
                console.log(`      ${symbol} ${outcome}: ${count} (${percentage}%)`);
            });
        
        // Detalhar especificamente outcomes de remarcação
        const rescheduleBreakdown = {};
        if (rescheduleSessions.length > 0) {
            console.log(`   📅 Breakdown remarcações:`);
            rescheduleSessions.forEach(session => {
                const outcome = session.final_outcome;
                rescheduleBreakdown[outcome] = (rescheduleBreakdown[outcome] || 0) + 1;
            });
            
            Object.entries(rescheduleBreakdown).forEach(([outcome, count]) => {
                console.log(`      📝 ${outcome}: ${count} sessões`);
            });
        }
        
        // Análise operacional
        console.log(`   📈 ANÁLISE OPERACIONAL:`);
        if (reschedulePercentage === 0) {
            console.log(`      ✅ ESTÁVEL: 0% remarcações - agenda muito estável`);
        } else if (reschedulePercentage < 5) {
            console.log(`      ✅ BOM: ${reschedulePercentage.toFixed(1)}% remarcações - nível baixo`);
        } else if (reschedulePercentage < 15) {
            console.log(`      ⚠️  MÉDIO: ${reschedulePercentage.toFixed(1)}% remarcações - monitorar flexibilidade`);
        } else if (reschedulePercentage < 30) {
            console.log(`      ❌ ALTO: ${reschedulePercentage.toFixed(1)}% remarcações - alta instabilidade`);
        } else {
            console.log(`      🔥 CRÍTICO: ${reschedulePercentage.toFixed(1)}% remarcações - agenda muito instável`);
        }
        
        const result = {
            reschedule_percentage: Math.round(reschedulePercentage * 100) / 100,
            reschedule_conversations: rescheduleCount,
            total_conversations: totalSessions,
            outcomes_distribution: outcomesDistribution,
            reschedule_breakdown: rescheduleBreakdown,
            stability_level: reschedulePercentage < 5 ? 'ESTÁVEL' : 
                           reschedulePercentage < 15 ? 'BOM' : 
                           reschedulePercentage < 30 ? 'MÉDIO' : 'INSTÁVEL'
        };
        
        console.log(`   ✅ Resultado: ${rescheduleCount}/${totalSessions} = ${reschedulePercentage.toFixed(2)}% de remarcações`);
        
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
    console.log('🧪 TESTE DA MÉTRICA RESCHEDULE_RATE');
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
                    const result = await calculateRescheduleRate(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Remarcações: ${result.reschedule_conversations}/${result.total_conversations}`);
                    console.log(`      Taxa remarcação: ${result.reschedule_percentage}%`);
                    console.log(`      Estabilidade agenda: ${result.stability_level}`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n📋 OUTCOMES DE REMARCAÇÃO TESTADOS:');
        console.log('   📅 appointment_rescheduled - Appointment remarcado para nova data/hora');
        console.log('   📅 appointment_modified - Appointment modificado (serviço, profissional, etc.)');
        console.log('\n📈 ESCALA DE ESTABILIDADE:');
        console.log('   ✅ 0-5%: ESTÁVEL - Agenda muito estável');
        console.log('   ✅ 5-15%: BOM - Nível aceitável de mudanças');
        console.log('   ⚠️  15-30%: MÉDIO - Monitorar flexibilidade necessária');
        console.log('   ❌ >30%: INSTÁVEL - Alta instabilidade operacional');
        
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

module.exports = { calculateRescheduleRate };