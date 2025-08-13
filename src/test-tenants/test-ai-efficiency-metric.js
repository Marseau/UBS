#!/usr/bin/env node

/**
 * TESTE: AI Assistant Efficiency Metric
 * 
 * Valida a implementação da métrica 4 do dashboard tenant
 * Testa cálculo por tenant e período com formato transparente
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Classificação dos outcomes (igual ao cron service)
const SUCCESS_OUTCOMES = [
    'appointment_created',
    'appointment_confirmed', 
    'appointment_rescheduled',
    'info_request_fulfilled',
    'price_inquiry',
    'business_hours_inquiry',
    'location_inquiry',
    'appointment_inquiry'
];

const NEUTRAL_OUTCOMES = [
    'appointment_cancelled',
    'appointment_modified', 
    'booking_abandoned'
];

const FAILURE_OUTCOMES = [
    'timeout_abandoned',
    'conversation_timeout'
];

const EXCLUDED_OUTCOMES = [
    'wrong_number',          // Problema de qualidade de contato
    'spam_detected',         // Problema de qualidade de contato
    'test_message',          // Teste do sistema
    'appointment_noshow_followup' // Problema pós-agendamento
];

/**
 * Calcular datas de início e fim para cada período
 */
function calculatePeriodDates(period) {
    const end = new Date();
    const start = new Date();
    
    switch (period) {
        case '7d':
            start.setDate(end.getDate() - 7);
            break;
        case '30d':
            start.setDate(end.getDate() - 30);
            break;
        case '90d':
            start.setDate(end.getDate() - 90);
            break;
    }
    
    return { start, end };
}

/**
 * Implementação da métrica AI Assistant Efficiency
 */
async function calculateAIEfficiency(tenantId, period) {
    console.log(`\n🤖 CALCULANDO AI ASSISTANT EFFICIENCY`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Período: ${period}`);
    console.log('─'.repeat(50));
    
    const { start: currentStart, end: currentEnd } = calculatePeriodDates(period);
    
    // Buscar todas as conversas do período com outcomes e confidence scores
    const { data: conversations, error } = await supabase
        .from('conversation_history')
        .select(`
            conversation_outcome,
            confidence_score,
            conversation_context
        `)
        .eq('tenant_id', tenantId)
        .gte('created_at', currentStart.toISOString())
        .lte('created_at', currentEnd.toISOString())
        .not('conversation_outcome', 'is', null)
        .not('confidence_score', 'is', null);

    if (error) {
        console.error('❌ Erro ao buscar conversas:', error);
        return null;
    }

    if (!conversations || conversations.length === 0) {
        console.log('⚠️ Nenhuma conversa encontrada para este período');
        return {
            percentage: 0,
            total_conversations: 0,
            success_weighted: 0,
            neutral_weighted: 0,
            failure_weighted: 0,
            total_weighted: 0,
            avg_confidence_score: 0,
            breakdown: {
                success: {},
                neutral: {},
                failure: {},
                excluded: {}
            }
        };
    }

    console.log(`📊 Total registros encontrados: ${conversations.length}`);

    // Agrupar por session_id para obter conversas únicas
    const conversationsBySession = new Map();
    
    for (const conv of conversations) {
        const sessionId = conv.conversation_context?.session_id || 'unknown';
        
        if (!conversationsBySession.has(sessionId)) {
            conversationsBySession.set(sessionId, {
                session_id: sessionId,
                final_outcome: conv.conversation_outcome,
                avg_confidence_score: conv.confidence_score,
                conversation_count: 1
            });
        } else {
            const existing = conversationsBySession.get(sessionId);
            // Pegar o último outcome e fazer média do confidence
            existing.final_outcome = conv.conversation_outcome;
            existing.avg_confidence_score = 
                (existing.avg_confidence_score + conv.confidence_score) / 2;
            existing.conversation_count++;
        }
    }
    
    const uniqueConversations = Array.from(conversationsBySession.values());
    console.log(`📊 Conversas únicas (por session): ${uniqueConversations.length}`);

    let totalWeightedInteractions = 0;
    let successWeightedInteractions = 0;
    let neutralWeightedInteractions = 0;
    let failureWeightedInteractions = 0;
    let totalConfidenceSum = 0;
    let validConversationsCount = 0;

    // Contadores para breakdown transparente
    const breakdown = {
        success: {},
        neutral: {},
        failure: {},
        excluded: {}
    };

    for (const conversation of uniqueConversations) {
        const outcome = conversation.final_outcome;
        const avgConfidence = conversation.avg_confidence_score;
        
        // Rastrear outcomes excluídos
        if (EXCLUDED_OUTCOMES.includes(outcome)) {
            if (!breakdown.excluded[outcome]) {
                breakdown.excluded[outcome] = { count: 0, reason: getExclusionReason(outcome) };
            }
            breakdown.excluded[outcome].count++;
            continue;
        }

        // Adicionar ao rastreamento de confidence
        totalConfidenceSum += avgConfidence;
        validConversationsCount++;
        
        // Calcular weighted score
        const weightedScore = avgConfidence;
        totalWeightedInteractions += weightedScore;

        if (SUCCESS_OUTCOMES.includes(outcome)) {
            successWeightedInteractions += weightedScore;
            if (!breakdown.success[outcome]) {
                breakdown.success[outcome] = { count: 0, weighted_score: 0 };
            }
            breakdown.success[outcome].count++;
            breakdown.success[outcome].weighted_score += weightedScore;
            
        } else if (NEUTRAL_OUTCOMES.includes(outcome)) {
            neutralWeightedInteractions += weightedScore;
            if (!breakdown.neutral[outcome]) {
                breakdown.neutral[outcome] = { count: 0, weighted_score: 0 };
            }
            breakdown.neutral[outcome].count++;
            breakdown.neutral[outcome].weighted_score += weightedScore;
            
        } else if (FAILURE_OUTCOMES.includes(outcome)) {
            failureWeightedInteractions += weightedScore;
            if (!breakdown.failure[outcome]) {
                breakdown.failure[outcome] = { count: 0, weighted_score: 0 };
            }
            breakdown.failure[outcome].count++;
            breakdown.failure[outcome].weighted_score += weightedScore;
        }
    }

    // Calcular eficiência final
    // Fórmula: (Success + Neutral * 0.5) / Total * 100
    const finalSuccessScore = successWeightedInteractions + (neutralWeightedInteractions * 0.5);
    const efficiencyPercentage = totalWeightedInteractions > 0 
        ? (finalSuccessScore / totalWeightedInteractions) * 100 
        : 0;
    
    const avgConfidenceScore = validConversationsCount > 0 
        ? totalConfidenceSum / validConversationsCount 
        : 0;

    return {
        percentage: Math.round(efficiencyPercentage * 100) / 100,
        total_conversations: validConversationsCount,
        success_weighted: Math.round(successWeightedInteractions * 1000) / 1000,
        neutral_weighted: Math.round(neutralWeightedInteractions * 1000) / 1000,
        failure_weighted: Math.round(failureWeightedInteractions * 1000) / 1000,
        total_weighted: Math.round(totalWeightedInteractions * 1000) / 1000,
        avg_confidence_score: Math.round(avgConfidenceScore * 1000) / 1000,
        breakdown: breakdown
    };
}

/**
 * Obter razão de exclusão para outcomes
 */
function getExclusionReason(outcome) {
    const reasons = {
        'wrong_number': 'contact_quality_issue',
        'spam_detected': 'contact_quality_issue', 
        'test_message': 'system_test',
        'appointment_noshow_followup': 'post_appointment_issue'
    };
    return reasons[outcome] || 'unknown';
}

/**
 * Formato transparente para exibição
 */
function displayTransparentResults(results, period, tenantId) {
    console.log(`\n📈 RESULTADOS TRANSPARENTES - AI ASSISTANT EFFICIENCY`);
    console.log(`   Tenant: ${tenantId} | Período: ${period}`);
    console.log('═'.repeat(70));
    
    console.log(`\n📊 MÉTRICAS PRINCIPAIS:`);
    console.log(`   Total Conversas: ${results.total_conversations}`);
    console.log(`   Success Weighted: ${results.success_weighted}`);
    console.log(`   Neutral Weighted: ${results.neutral_weighted}`);
    console.log(`   Failure Weighted: ${results.failure_weighted}`);
    console.log(`   Total Weighted: ${results.total_weighted}`);
    console.log(`   Avg Confidence: ${results.avg_confidence_score}`);
    console.log(`   AI Efficiency: ${results.percentage}%`);
    
    console.log(`\n✅ SUCCESS OUTCOMES:`);
    Object.entries(results.breakdown.success).forEach(([outcome, data]) => {
        console.log(`   ${outcome}: ${data.count} conversas (weighted: ${data.weighted_score.toFixed(3)})`);
    });
    
    console.log(`\n⚖️ NEUTRAL OUTCOMES:`);
    Object.entries(results.breakdown.neutral).forEach(([outcome, data]) => {
        console.log(`   ${outcome}: ${data.count} conversas (weighted: ${data.weighted_score.toFixed(3)})`);
    });
    
    console.log(`\n❌ FAILURE OUTCOMES:`);
    Object.entries(results.breakdown.failure).forEach(([outcome, data]) => {
        console.log(`   ${outcome}: ${data.count} conversas (weighted: ${data.weighted_score.toFixed(3)})`);
    });
    
    console.log(`\n🚫 EXCLUDED OUTCOMES:`);
    Object.entries(results.breakdown.excluded).forEach(([outcome, data]) => {
        console.log(`   ${outcome}: ${data.count} conversas (${data.reason})`);
    });
    
    // Fórmula explicada
    const neutralContribution = results.neutral_weighted * 0.5;
    const numerator = results.success_weighted + neutralContribution;
    console.log(`\n🧮 CÁLCULO DA FÓRMULA:`);
    console.log(`   Numerador: ${results.success_weighted} + (${results.neutral_weighted} × 0.5) = ${numerator.toFixed(3)}`);
    console.log(`   Denominador: ${results.total_weighted}`);
    console.log(`   Resultado: (${numerator.toFixed(3)} ÷ ${results.total_weighted}) × 100 = ${results.percentage}%`);
}

/**
 * Testar a métrica para todos os tenants e períodos
 */
async function testAIEfficiencyMetric() {
    console.log('🚀 INICIANDO TESTE: AI ASSISTANT EFFICIENCY METRIC');
    console.log('='.repeat(60));
    
    try {
        // Buscar tenants ativos
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(3); // Limitar para teste
        
        if (error) {
            console.error('❌ Erro ao buscar tenants:', error);
            return;
        }
        
        const periods = ['7d', '30d', '90d'];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TESTANDO TENANT: ${tenant.name} (${tenant.id})`);
            console.log('─'.repeat(60));
            
            for (const period of periods) {
                const results = await calculateAIEfficiency(tenant.id, period);
                
                if (results) {
                    displayTransparentResults(results, period, tenant.id);
                    console.log('\n' + '─'.repeat(60));
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar o teste
if (require.main === module) {
    testAIEfficiencyMetric().catch(console.error);
}

module.exports = {
    calculateAIEfficiency,
    displayTransparentResults
};