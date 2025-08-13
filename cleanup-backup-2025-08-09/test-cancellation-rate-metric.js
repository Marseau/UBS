#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA CANCELLATION_RATE
 * 
 * Testa o cálculo da taxa de cancelamentos de appointments
 * para análise de impacto na receita e gestão operacional
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular cancellation_rate para um tenant e período
 */
async function calculateCancellationRate(tenantId, periodDays) {
    console.log(`❌ Testando CANCELLATION_RATE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Definir ENUMs conforme implementação atual
        const CANCELLATION_OUTCOMES = [
            'appointment_cancelled'  // Appointment foi cancelado
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
                cancellation_percentage: 0,
                cancelled_conversations: 0,
                total_conversations: 0,
                outcomes_distribution: {},
                business_impact: 'NEUTRO'
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
        
        // Contar conversas de cancelamento
        const cancellationSessions = validSessions.filter(session =>
            CANCELLATION_OUTCOMES.includes(session.final_outcome)
        );
        
        const totalSessions = validSessions.length;
        const cancellationCount = cancellationSessions.length;
        const cancellationPercentage = totalSessions > 0 ? (cancellationCount / totalSessions) * 100 : 0;
        
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
                const isCancellation = CANCELLATION_OUTCOMES.includes(outcome);
                const symbol = isCancellation ? '❌' : '⚪';
                const percentage = (count / totalSessions * 100).toFixed(1);
                console.log(`      ${symbol} ${outcome}: ${count} (${percentage}%)`);
            });
        
        // Detalhar especificamente outcomes de cancelamento
        if (cancellationSessions.length > 0) {
            console.log(`   ❌ Breakdown cancelamentos:`);
            cancellationSessions.forEach(session => {
                console.log(`      📝 ${session.final_outcome} - Sessão ${session.session_id.substring(0, 8)}`);
            });
        }
        
        // Análise de impacto no negócio
        console.log(`   📈 ANÁLISE DE IMPACTO NO NEGÓCIO:`);
        let businessImpact = '';
        if (cancellationPercentage === 0) {
            console.log(`      ✅ EXCELENTE: 0% cancelamentos - retenção perfeita`);
            businessImpact = 'EXCELENTE';
        } else if (cancellationPercentage < 10) {
            console.log(`      ✅ BOM: ${cancellationPercentage.toFixed(1)}% cancelamentos - nível aceitável`);
            businessImpact = 'BOM';
        } else if (cancellationPercentage < 25) {
            console.log(`      ⚠️  MÉDIO: ${cancellationPercentage.toFixed(1)}% cancelamentos - monitorar causas`);
            businessImpact = 'MÉDIO';
        } else if (cancellationPercentage < 40) {
            console.log(`      ❌ ALTO: ${cancellationPercentage.toFixed(1)}% cancelamentos - impacto significativo na receita`);
            businessImpact = 'ALTO';
        } else {
            console.log(`      🔥 CRÍTICO: ${cancellationPercentage.toFixed(1)}% cancelamentos - grave problema operacional`);
            businessImpact = 'CRÍTICO';
        }
        
        // Calcular outros outcomes para context
        const otherOutcomes = {
            appointments_created: outcomesDistribution['appointment_created'] || 0,
            appointments_confirmed: outcomesDistribution['appointment_confirmed'] || 0,
            price_inquiries: outcomesDistribution['price_inquiry'] || 0,
            info_requests: outcomesDistribution['info_request_fulfilled'] || 0
        };
        
        console.log(`   🔍 CONTEXTO OPERACIONAL:`);
        console.log(`      Appointments criados: ${otherOutcomes.appointments_created}`);
        console.log(`      Appointments confirmados: ${otherOutcomes.appointments_confirmed}`);
        console.log(`      Cancelamentos: ${cancellationCount}`);
        console.log(`      Ratio Cancel/Create: ${otherOutcomes.appointments_created > 0 ? (cancellationCount / otherOutcomes.appointments_created * 100).toFixed(1) : 0}%`);
        
        const result = {
            cancellation_percentage: Math.round(cancellationPercentage * 100) / 100,
            cancelled_conversations: cancellationCount,
            total_conversations: totalSessions,
            outcomes_distribution: outcomesDistribution,
            business_impact: businessImpact,
            operational_context: otherOutcomes,
            cancel_to_create_ratio: otherOutcomes.appointments_created > 0 ? 
                Math.round((cancellationCount / otherOutcomes.appointments_created * 100) * 100) / 100 : 0
        };
        
        console.log(`   ✅ Resultado: ${cancellationCount}/${totalSessions} = ${cancellationPercentage.toFixed(2)}% de cancelamentos`);
        
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
    console.log('🧪 TESTE DA MÉTRICA CANCELLATION_RATE');
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
                    const result = await calculateCancellationRate(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Cancelamentos: ${result.cancelled_conversations}/${result.total_conversations}`);
                    console.log(`      Taxa cancelamento: ${result.cancellation_percentage}%`);
                    console.log(`      Impacto no negócio: ${result.business_impact}`);
                    console.log(`      Ratio Cancel/Create: ${result.cancel_to_create_ratio}%`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n📋 OUTCOMES DE CANCELAMENTO TESTADOS:');
        console.log('   ❌ appointment_cancelled - Appointment foi cancelado');
        console.log('\n📈 ESCALA DE IMPACTO NO NEGÓCIO:');
        console.log('   ✅ 0-10%: BOM - Nível aceitável de cancelamentos');
        console.log('   ⚠️  10-25%: MÉDIO - Monitorar causas dos cancelamentos');
        console.log('   ❌ 25-40%: ALTO - Impacto significativo na receita');
        console.log('   🔥 >40%: CRÍTICO - Grave problema operacional');
        console.log('\n💡 INSIGHTS OPERACIONAIS:');
        console.log('   📊 Ratio Cancel/Create mostra relação entre appointments criados vs cancelados');
        console.log('   🎯 Alta taxa pode indicar problemas de experiência, preço ou expectativa');
        console.log('   💰 Impacto direto na receita - cada cancelamento é perda de faturamento');
        
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

module.exports = { calculateCancellationRate };