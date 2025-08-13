/**
 * FUNÇÃO DE TOTALIZAÇÃO - CONVERSATION_HISTORY
 * 
 * Calcula todas as 41 totalizações identificadas da tabela conversation_history
 * Para inserir como metric_type específico em tenant_metrics
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcula todas as totalizações de conversation_history para um tenant/período
 */
async function calculateConversationTotals(tenantId, periodDays) {
  console.log(`💬 Calculando totalizações de conversation_history - tenant ${tenantId} (${periodDays}d)`);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  
  try {
    // Buscar todas as conversas do período
    const { data: conversations, error } = await supabase
      .from('conversation_history')
      .select(`
        id,
        user_id,
        is_from_user,
        message_type,
        intent_detected,
        confidence_score,
        conversation_outcome,
        conversation_context,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString());

    if (error) {
      throw new Error(`Erro ao buscar conversation_history: ${error.message}`);
    }

    if (!conversations || conversations.length === 0) {
      return getEmptyConversationTotals(periodDays);
    }

    // 1. TOTAIS BÁSICOS
    const totalMessages = conversations.length;
    const totalUserMessages = conversations.filter(c => c.is_from_user === true).length;
    const totalAiMessages = conversations.filter(c => c.is_from_user === false).length;
    
    // Extrair session_ids e calcular conversas únicas
    const sessionIds = new Set();
    let totalConversationMinutes = 0;
    const conversationDurations = [];
    
    conversations.forEach(conv => {
      if (conv.conversation_context?.session_id) {
        sessionIds.add(conv.conversation_context.session_id);
        if (conv.conversation_context.duration_minutes) {
          conversationDurations.push(conv.conversation_context.duration_minutes);
          totalConversationMinutes += conv.conversation_context.duration_minutes;
        }
      }
    });
    
    const totalConversations = sessionIds.size;

    // 2. MESSAGE_TYPE
    const textMessages = conversations.filter(c => c.message_type === 'text').length;
    const otherMessageTypes = conversations.filter(c => c.message_type !== 'text' && c.message_type).length;

    // 3. INTENT_DETECTED (7 tipos)
    const intents = {
      confirmation: conversations.filter(c => c.intent_detected === 'confirmation').length,
      gratitude: conversations.filter(c => c.intent_detected === 'gratitude').length,
      date_preference: conversations.filter(c => c.intent_detected === 'date_preference').length,
      booking_request: conversations.filter(c => c.intent_detected === 'booking_request').length,
      insurance_inquiry: conversations.filter(c => c.intent_detected === 'insurance_inquiry').length,
      cancellation_request: conversations.filter(c => c.intent_detected === 'cancellation_request').length,
      price_inquiry: conversations.filter(c => c.intent_detected === 'price_inquiry').length
    };

    // 4. CONVERSATION_OUTCOMES - SUCCESS (8 tipos)
    const successOutcomes = {
      appointment_created: conversations.filter(c => c.conversation_outcome === 'appointment_created').length,
      appointment_confirmed: conversations.filter(c => c.conversation_outcome === 'appointment_confirmed').length,
      appointment_rescheduled: conversations.filter(c => c.conversation_outcome === 'appointment_rescheduled').length,
      info_request_fulfilled: conversations.filter(c => c.conversation_outcome === 'info_request_fulfilled').length,
      price_inquiry_outcomes: conversations.filter(c => c.conversation_outcome === 'price_inquiry').length,
      business_hours_inquiry: conversations.filter(c => c.conversation_outcome === 'business_hours_inquiry').length,
      location_inquiry: conversations.filter(c => c.conversation_outcome === 'location_inquiry').length,
      appointment_inquiry: conversations.filter(c => c.conversation_outcome === 'appointment_inquiry').length
    };

    // 5. CONVERSATION_OUTCOMES - NEUTRAL (2 tipos)
    const neutralOutcomes = {
      appointment_cancelled: conversations.filter(c => c.conversation_outcome === 'appointment_cancelled').length,
      appointment_modified: conversations.filter(c => c.conversation_outcome === 'appointment_modified').length
    };

    // 6. CONVERSATION_OUTCOMES - FAILURE (3 tipos)
    const failureOutcomes = {
      booking_abandoned: conversations.filter(c => c.conversation_outcome === 'booking_abandoned').length,
      timeout_abandoned: conversations.filter(c => c.conversation_outcome === 'timeout_abandoned').length,
      conversation_timeout: conversations.filter(c => c.conversation_outcome === 'conversation_timeout').length
    };

    // 7. CONVERSATION_OUTCOMES - EXCLUDED (3 tipos)
    const excludedOutcomes = {
      wrong_number: conversations.filter(c => c.conversation_outcome === 'wrong_number').length,
      spam_detected: conversations.filter(c => c.conversation_outcome === 'spam_detected').length,
      test_message: conversations.filter(c => c.conversation_outcome === 'test_message').length
    };

    // 8. CONFIDENCE & QUALITY
    const conversationsWithConfidence = conversations.filter(c => c.confidence_score !== null && c.confidence_score !== undefined).length;
    const confidenceScores = conversations
      .filter(c => c.confidence_score !== null && c.confidence_score !== undefined)
      .map(c => parseFloat(c.confidence_score));
    
    const avgConfidenceScore = confidenceScores.length > 0 ? 
      confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length : 0;
    
    const highConfidenceConversations = confidenceScores.filter(score => score > 0.8).length;
    const mediumConfidenceConversations = confidenceScores.filter(score => score >= 0.5 && score <= 0.8).length;
    const lowConfidenceConversations = confidenceScores.filter(score => score < 0.5).length;

    // 9. DURAÇÃO DE CONVERSAS
    const avgConversationDuration = conversationDurations.length > 0 ?
      conversationDurations.reduce((sum, dur) => sum + dur, 0) / conversationDurations.length : 0;
    const maxConversationDuration = conversationDurations.length > 0 ? Math.max(...conversationDurations) : 0;
    const minConversationDuration = conversationDurations.length > 0 ? Math.min(...conversationDurations) : 0;

    // 10. MÉTRICAS DERIVADAS
    const totalSuccessOutcomes = Object.values(successOutcomes).reduce((sum, count) => sum + count, 0);
    const totalFailureOutcomes = Object.values(failureOutcomes).reduce((sum, count) => sum + count, 0);
    const totalNeutralOutcomes = Object.values(neutralOutcomes).reduce((sum, count) => sum + count, 0);
    const totalValidOutcomes = totalSuccessOutcomes + totalFailureOutcomes + totalNeutralOutcomes;

    const successRate = totalValidOutcomes > 0 ? (totalSuccessOutcomes / totalValidOutcomes) * 100 : 0;
    const failureRate = totalValidOutcomes > 0 ? (totalFailureOutcomes / totalValidOutcomes) * 100 : 0;
    const qualityScore = totalMessages > 0 ? 
      ((conversationsWithConfidence + highConfidenceConversations) / totalMessages) * 100 : 0;
    const engagementRate = totalMessages > 0 ? (totalUserMessages / totalMessages) * 100 : 0;

    // CONSOLIDAR RESULTADO
    const result = {
      period_days: periodDays,
      calculated_at: new Date().toISOString(),
      
      // 1. Totais básicos
      total_conversations: totalConversations,
      total_conversation_minutes: totalConversationMinutes,
      total_messages: totalMessages,
      total_user_messages: totalUserMessages,
      total_ai_messages: totalAiMessages,
      
      // 2. Message types
      text_messages: textMessages,
      other_message_types: otherMessageTypes,
      
      // 3. Intents
      intents: intents,
      
      // 4. Success outcomes
      success_outcomes: successOutcomes,
      
      // 5. Neutral outcomes
      neutral_outcomes: neutralOutcomes,
      
      // 6. Failure outcomes
      failure_outcomes: failureOutcomes,
      
      // 7. Excluded outcomes
      excluded_outcomes: excludedOutcomes,
      
      // 8. Confidence & Quality
      conversations_with_confidence: conversationsWithConfidence,
      avg_confidence_score: Math.round(avgConfidenceScore * 100) / 100,
      high_confidence_conversations: highConfidenceConversations,
      medium_confidence_conversations: mediumConfidenceConversations,
      low_confidence_conversations: lowConfidenceConversations,
      
      // 9. Duração
      avg_conversation_duration: Math.round(avgConversationDuration * 100) / 100,
      max_conversation_duration: maxConversationDuration,
      min_conversation_duration: minConversationDuration,
      
      // 10. Métricas derivadas
      success_rate: Math.round(successRate * 100) / 100,
      failure_rate: Math.round(failureRate * 100) / 100,
      quality_score: Math.round(qualityScore * 100) / 100,
      engagement_rate: Math.round(engagementRate * 100) / 100
    };

    console.log(`   ✅ Conversas: ${totalConversations}, Minutos: ${totalConversationMinutes}, Success: ${successRate.toFixed(1)}%`);
    return result;

  } catch (error) {
    console.error(`❌ Erro ao calcular conversation totals: ${error.message}`);
    return getEmptyConversationTotals(periodDays);
  }
}

/**
 * Retorna estrutura vazia quando não há dados
 */
function getEmptyConversationTotals(periodDays) {
  return {
    period_days: periodDays,
    calculated_at: new Date().toISOString(),
    total_conversations: 0,
    total_conversation_minutes: 0,
    total_messages: 0,
    total_user_messages: 0,
    total_ai_messages: 0,
    text_messages: 0,
    other_message_types: 0,
    intents: {
      confirmation: 0,
      gratitude: 0,
      date_preference: 0,
      booking_request: 0,
      insurance_inquiry: 0,
      cancellation_request: 0,
      price_inquiry: 0
    },
    success_outcomes: {
      appointment_created: 0,
      appointment_confirmed: 0,
      appointment_rescheduled: 0,
      info_request_fulfilled: 0,
      price_inquiry_outcomes: 0,
      business_hours_inquiry: 0,
      location_inquiry: 0,
      appointment_inquiry: 0
    },
    neutral_outcomes: {
      appointment_cancelled: 0,
      appointment_modified: 0
    },
    failure_outcomes: {
      booking_abandoned: 0,
      timeout_abandoned: 0,
      conversation_timeout: 0
    },
    excluded_outcomes: {
      wrong_number: 0,
      spam_detected: 0,
      test_message: 0
    },
    conversations_with_confidence: 0,
    avg_confidence_score: 0,
    high_confidence_conversations: 0,
    medium_confidence_conversations: 0,
    low_confidence_conversations: 0,
    avg_conversation_duration: 0,
    max_conversation_duration: 0,
    min_conversation_duration: 0,
    success_rate: 0,
    failure_rate: 0,
    quality_score: 0,
    engagement_rate: 0
  };
}

module.exports = {
  calculateConversationTotals
};