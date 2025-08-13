-- Gerar CSV completo de todas as 1.041 conversas
WITH conversation_metrics AS (
    SELECT 
        ch.conversation_context->>'session_id' as session_id,
        ch.tenant_id,
        ch.user_id,
        MIN(ch.created_at) as conversation_start,
        MAX(ch.created_at) as conversation_end,
        EXTRACT(EPOCH FROM (MAX(ch.created_at) - MIN(ch.created_at)))/60 as duration_minutes,
        COUNT(*) as total_messages,
        COUNT(CASE WHEN ch.is_from_user = true THEN 1 END) as user_messages,
        COUNT(CASE WHEN ch.is_from_user = false THEN 1 END) as ai_messages,
        AVG(CASE WHEN ch.confidence_score IS NOT NULL THEN ch.confidence_score END) as avg_confidence_score,
        SUM(ch.tokens_used) as total_tokens,
        SUM(ch.api_cost_usd) as total_api_cost,
        SUM(ch.processing_cost_usd) as total_processing_cost,
        MAX(ch.conversation_outcome) as final_outcome,
        STRING_AGG(DISTINCT ch.intent_detected, ', ' ORDER BY ch.intent_detected) as detected_intents
    FROM conversation_history ch
    GROUP BY ch.conversation_context->>'session_id', ch.tenant_id, ch.user_id
)
SELECT 
    cm.session_id,
    COALESCE(t.business_name, t.id::text) as tenant_name,
    COALESCE(u.name, u.id::text) as user_name,
    cm.conversation_start,
    cm.conversation_end,
    ROUND(cm.duration_minutes::numeric, 2) as duration_minutes,
    cm.total_messages,
    cm.user_messages,
    cm.ai_messages,
    ROUND(cm.avg_confidence_score::numeric, 3) as avg_confidence_score,
    cm.total_tokens,
    ROUND(cm.total_api_cost::numeric, 4) as total_api_cost,
    ROUND(cm.total_processing_cost::numeric, 4) as total_processing_cost,
    ROUND((cm.total_api_cost + cm.total_processing_cost)::numeric, 4) as total_cost,
    cm.final_outcome,
    cm.detected_intents
FROM conversation_metrics cm
LEFT JOIN tenants t ON t.id = cm.tenant_id
LEFT JOIN users u ON u.id = cm.user_id
ORDER BY cm.conversation_start DESC;