const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * TESTE TENANT OUTCOMES - SIMULAÇÃO POSTGRESQL
 * 
 * Simula a PostgreSQL function para Tenant Outcomes:
 * tenant_outcomes_7d_30d_90d - 7 categorias × 3 períodos = 21 métricas
 * 
 * 7 CATEGORIAS DE OUTCOME:
 * 1. Agendamentos (appointment_created, appointment_confirmed)
 * 2. Remarcados (appointment_rescheduled) 
 * 3. Informativos (info_request_fulfilled, price_inquiry, etc.)
 * 4. Cancelados (appointment_cancelled)
 * 5. Modificados (appointment_modified)
 * 6. FalhaIA (booking_abandoned, timeout_abandoned, conversation_timeout)
 * 7. Spam (wrong_number, spam_detected)
 */

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ MAPEAMENTO EXATO dos scripts validados
const OUTCOME_CATEGORIES = {
    agendamentos: [
        'appointment_created',
        'appointment_confirmed'
    ],
    remarcados: [
        'appointment_rescheduled'
    ],
    informativos: [
        'info_request_fulfilled',
        'price_inquiry', 
        'business_hours_inquiry',
        'location_inquiry',
        'appointment_inquiry',
        'appointment_noshow_followup'
    ],
    cancelados: [
        'appointment_cancelled'
    ],
    modificados: [
        'appointment_modified'
    ],
    falhaIA: [
        'booking_abandoned',
        'timeout_abandoned',
        'conversation_timeout'
    ],
    spam: [
        'wrong_number',
        'spam_detected'
    ]
};

/**
 * Calcular Tenant Outcomes para um período específico
 */
async function calculateTenantOutcomesForPeriod(tenantId, periodDays) {
    console.log(`🎯 TENANT_OUTCOMES_${periodDays}D para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Query EXATA dos scripts validados
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('conversation_outcome, conversation_context, created_at')
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
            return { agendamentos: 0, remarcados: 0, informativos: 0, cancelados: 0, modificados: 0, falhaIA: 0, spam: 0 };
        }

        // ✅ LÓGICA EXATA dos scripts: Agrupar por session_id
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    final_outcome: conv.conversation_outcome
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Usar outcome mais recente como final
                if (new Date(conv.created_at) > new Date(session.conversation_start)) {
                    session.final_outcome = conv.conversation_outcome;
                }
            }
        }

        // Filtrar sessões que iniciaram no período
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && sessionStart <= endDate;
        });

        // Contar outcomes por categoria
        const categoryCounts = {
            agendamentos: 0,
            remarcados: 0, 
            informativos: 0,
            cancelados: 0,
            modificados: 0,
            falhaIA: 0,
            spam: 0
        };

        // Classificar cada sessão na categoria correta
        validSessions.forEach(session => {
            const outcome = session.final_outcome;
            
            for (const [category, outcomes] of Object.entries(OUTCOME_CATEGORIES)) {
                if (outcomes.includes(outcome)) {
                    categoryCounts[category]++;
                    break;
                }
            }
        });

        const totalConversations = validSessions.length;

        console.log(`   💬 Total conversas: ${totalConversations}`);
        console.log(`   📊 Por categoria:`);
        Object.entries(categoryCounts).forEach(([category, count]) => {
            const percentage = totalConversations > 0 ? (count / totalConversations * 100).toFixed(1) : '0.0';
            console.log(`      ${category}: ${count} (${percentage}%)`);
        });
        
        return categoryCounts;
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Calcular Tenant Outcomes para TODOS os 3 períodos (7d, 30d, 90d)
 */
async function calculateTenantOutcomes7d30d90d(tenantId) {
    console.log(`🎯 TENANT_OUTCOMES_7D_30D_90D para tenant ${tenantId.substring(0, 8)}`);
    console.log('='.repeat(70));
    
    try {
        // Calcular para os 3 períodos em paralelo
        const [outcomes7d, outcomes30d, outcomes90d] = await Promise.all([
            calculateTenantOutcomesForPeriod(tenantId, 7),
            calculateTenantOutcomesForPeriod(tenantId, 30),
            calculateTenantOutcomesForPeriod(tenantId, 90)
        ]);

        // Montar resultado com 21 métricas (7 categorias × 3 períodos)
        const result = {
            agendamentos_7d: outcomes7d.agendamentos,
            agendamentos_30d: outcomes30d.agendamentos,
            agendamentos_90d: outcomes90d.agendamentos,
            remarcados_7d: outcomes7d.remarcados,
            remarcados_30d: outcomes30d.remarcados,
            remarcados_90d: outcomes90d.remarcados,
            informativos_7d: outcomes7d.informativos,
            informativos_30d: outcomes30d.informativos,
            informativos_90d: outcomes90d.informativos,
            cancelados_7d: outcomes7d.cancelados,
            cancelados_30d: outcomes30d.cancelados,
            cancelados_90d: outcomes90d.cancelados,
            modificados_7d: outcomes7d.modificados,
            modificados_30d: outcomes30d.modificados,
            modificados_90d: outcomes90d.modificados,
            falhaIA_7d: outcomes7d.falhaIA,
            falhaIA_30d: outcomes30d.falhaIA,
            falhaIA_90d: outcomes90d.falhaIA,
            spam_7d: outcomes7d.spam,
            spam_30d: outcomes30d.spam,
            spam_90d: outcomes90d.spam
        };

        console.log('\n📊 RESUMO CONSOLIDADO (7d | 30d | 90d):');
        console.log(`📅 Agendamentos: ${result.agendamentos_7d} | ${result.agendamentos_30d} | ${result.agendamentos_90d}`);
        console.log(`🔄 Remarcados: ${result.remarcados_7d} | ${result.remarcados_30d} | ${result.remarcados_90d}`);
        console.log(`📋 Informativos: ${result.informativos_7d} | ${result.informativos_30d} | ${result.informativos_90d}`);
        console.log(`❌ Cancelados: ${result.cancelados_7d} | ${result.cancelados_30d} | ${result.cancelados_90d}`);
        console.log(`✏️ Modificados: ${result.modificados_7d} | ${result.modificados_30d} | ${result.modificados_90d}`);
        console.log(`🤖 FalhaIA: ${result.falhaIA_7d} | ${result.falhaIA_30d} | ${result.falhaIA_90d}`);
        console.log(`🚫 Spam: ${result.spam_7d} | ${result.spam_30d} | ${result.spam_90d}`);

        return [result];

    } catch (error) {
        console.error('💥 ERRO NO CÁLCULO TENANT OUTCOMES:', error);
        throw error;
    }
}

/**
 * Testar a métrica Tenant Outcomes
 */
async function testTenantOutcomes() {
    console.log('🧪 TESTANDO TENANT OUTCOMES - 1 POSTGRESQL FUNCTION = 21 MÉTRICAS');
    console.log('='.repeat(80));
    
    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';

    try {
        console.log(`\n🏢 TESTE TENANT: ${testTenantId.substring(0, 8)}`);
        console.log('-'.repeat(60));

        // Testar função principal que retorna todas as 21 métricas
        const tenantOutcomesData = await calculateTenantOutcomes7d30d90d(testTenantId);

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('🎉 TESTE TENANT OUTCOMES CONCLUÍDO');
        
        console.log('\n✅ FUNÇÃO POSTGRESQL PRONTA PARA CRIAÇÃO');
        console.log('   📊 tenant_outcomes_7d_30d_90d() retorna 21 métricas em 1 chamada');
        console.log('   🔄 7 categorias × 3 períodos = 21 valores');
        console.log('   📋 Usa session_id grouping (lógica dos scripts validados)');
        console.log('   🎯 Classifica outcomes exatamente como os scripts originais');

        const result = tenantOutcomesData[0];
        const total7d = Object.keys(result).filter(k => k.endsWith('_7d')).reduce((sum, k) => sum + result[k], 0);
        const total30d = Object.keys(result).filter(k => k.endsWith('_30d')).reduce((sum, k) => sum + result[k], 0);
        const total90d = Object.keys(result).filter(k => k.endsWith('_90d')).reduce((sum, k) => sum + result[k], 0);
        
        console.log(`\n📈 TOTAIS POR PERÍODO:`);
        console.log(`   7d: ${total7d} conversas classificadas`);
        console.log(`   30d: ${total30d} conversas classificadas`);
        console.log(`   90d: ${total90d} conversas classificadas`);

        return tenantOutcomesData[0];

    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar teste
if (require.main === module) {
    testTenantOutcomes().then(() => {
        console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO');
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = {
    calculateTenantOutcomes7d30d90d
};