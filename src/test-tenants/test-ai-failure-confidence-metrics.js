#!/usr/bin/env node

/**
 * TESTE DAS MÉTRICAS AI_FAILURE_RATE e CONFIDENCE_SCORE
 * 
 * Substitui ai_assistant_efficiency por duas métricas científicas separadas:
 * 1. ai_failure_rate - % de conversas que a IA não conseguiu concluir 
 * 2. avg_confidence_score - Confiança média da IA nas respostas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular ai_failure_rate para um tenant e período
 */
async function calculateAIFailureRate(tenantId, periodDays) {
    console.log(`🤖 Testando AI_FAILURE_RATE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Definir ENUMs: apenas timeout/abandono são FALHAS da IA
        const FAILURE_OUTCOMES = ['timeout_abandoned', 'conversation_timeout'];
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
                failure_percentage: 0,
                failed_conversations: 0,
                total_conversations: 0
            };
        }
        
        // Agrupar por session_id
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
                if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = conv.created_at;
                }
                if (conv.conversation_outcome) {
                    session.final_outcome = conv.conversation_outcome;
                }
            }
        }
        
        // Filtrar sessões válidas (no período, excluindo problemas externos)
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && 
                   sessionStart <= endDate && 
                   !EXCLUDED_OUTCOMES.includes(session.final_outcome);
        });
        
        // Contar falhas da IA
        const failedSessions = validSessions.filter(session =>
            FAILURE_OUTCOMES.includes(session.final_outcome)
        );
        
        const totalValid = validSessions.length;
        const totalFailed = failedSessions.length;
        const failurePercentage = totalValid > 0 ? (totalFailed / totalValid) * 100 : 0;
        
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
                const isFailed = FAILURE_OUTCOMES.includes(outcome);
                const symbol = isFailed ? '❌' : '✅';
                console.log(`      ${symbol} ${outcome}: ${count}`);
            });
        
        const result = {
            failure_percentage: Math.round(failurePercentage * 100) / 100,
            failed_conversations: totalFailed,
            total_conversations: totalValid
        };
        
        console.log(`   ✅ AI_FAILURE_RATE: ${totalFailed}/${totalValid} = ${failurePercentage.toFixed(2)}% de falha`);
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Calcular avg_confidence_score para um tenant e período
 */
async function calculateAvgConfidenceScore(tenantId, periodDays) {
    console.log(`🎯 Testando AVG_CONFIDENCE_SCORE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        // Buscar conversas com confidence_score
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                confidence_score,
                conversation_context,
                created_at
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null)
            .not('confidence_score', 'is', null);
        
        if (error) {
            console.error(`   ❌ Erro na query confidence: ${error.message}`);
            throw error;
        }
        
        if (!conversations || conversations.length === 0) {
            console.log(`   📭 Nenhuma conversa com confidence encontrada`);
            return {
                avg_confidence: 0,
                total_conversations: 0,
                confidence_distribution: {}
            };
        }
        
        // Agrupar por session_id e calcular confidence médio por sessão
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    confidence_scores: [conv.confidence_score],
                    confidence_sum: conv.confidence_score,
                    confidence_count: 1
                });
            } else {
                const session = sessionMap.get(sessionId);
                if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = conv.created_at;
                }
                session.confidence_scores.push(conv.confidence_score);
                session.confidence_sum += conv.confidence_score;
                session.confidence_count++;
            }
        }
        
        // Filtrar sessões no período e calcular média por sessão
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && sessionStart <= endDate;
        }).map(session => ({
            ...session,
            avg_confidence: session.confidence_sum / session.confidence_count
        }));
        
        const totalSessions = validSessions.length;
        const totalConfidence = validSessions.reduce((sum, session) => sum + session.avg_confidence, 0);
        const avgConfidence = totalSessions > 0 ? totalConfidence / totalSessions : 0;
        
        // Distribuição de confidence (faixas)
        const confidenceDistribution = {
            'very_low (0.0-0.4)': 0,
            'low (0.4-0.6)': 0,
            'medium (0.6-0.8)': 0,
            'high (0.8-1.0)': 0
        };
        
        validSessions.forEach(session => {
            const conf = session.avg_confidence;
            if (conf < 0.4) confidenceDistribution['very_low (0.0-0.4)']++;
            else if (conf < 0.6) confidenceDistribution['low (0.4-0.6)']++;
            else if (conf < 0.8) confidenceDistribution['medium (0.6-0.8)']++;
            else confidenceDistribution['high (0.8-1.0)']++;
        });
        
        console.log(`   📊 Distribuição de confidence:`);
        Object.entries(confidenceDistribution).forEach(([range, count]) => {
            const percentage = totalSessions > 0 ? (count / totalSessions * 100).toFixed(1) : '0.0';
            console.log(`      ${range}: ${count} (${percentage}%)`);
        });
        
        const result = {
            avg_confidence: Math.round(avgConfidence * 1000) / 1000,
            total_conversations: totalSessions,
            confidence_distribution: confidenceDistribution
        };
        
        console.log(`   ✅ AVG_CONFIDENCE: ${avgConfidence.toFixed(3)} (${totalSessions} conversas)`);
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo confidence: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Testar múltiplos tenants e períodos
 */
async function runTests() {
    console.log('🧪 TESTE DAS MÉTRICAS AI_FAILURE_RATE e CONFIDENCE_SCORE');
    console.log('='.repeat(70));
    
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
                    console.log(`\n📋 PERÍODO ${periodDays}d:`);
                    
                    // Testar ambas as métricas
                    const [failureResult, confidenceResult] = await Promise.all([
                        calculateAIFailureRate(tenant.id, periodDays),
                        calculateAvgConfidenceScore(tenant.id, periodDays)
                    ]);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Falha IA: ${failureResult.failure_percentage}%`);
                    console.log(`      Confidence: ${confidenceResult.avg_confidence}`);
                    
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

module.exports = { calculateAIFailureRate, calculateAvgConfidenceScore };