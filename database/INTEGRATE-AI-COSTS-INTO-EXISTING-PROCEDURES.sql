-- ===================================================
-- INTEGRAÇÃO AI COSTS NAS PROCEDURES EXISTENTES
-- Usando campos que JÁ EXISTEM na conversation_history
-- ===================================================

-- 1. Atualizar get_tenant_metrics_for_period para incluir AI costs
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(
    tenant_id UUID, 
    start_date DATE, 
    end_date DATE
)
RETURNS TABLE (
    total_appointments INTEGER,
    confirmed_appointments INTEGER,
    cancelled_appointments INTEGER,
    completed_appointments INTEGER,
    pending_appointments INTEGER,
    total_revenue DECIMAL(15,2),
    average_value DECIMAL(15,2),
    total_customers INTEGER,
    new_customers INTEGER,
    total_services INTEGER,
    services_count INTEGER,
    services TEXT[],
    most_popular_service VARCHAR(255),
    service_utilization_rate DECIMAL(5,2),
    total_conversations INTEGER,
    ai_success_rate DECIMAL(5,2),
    avg_response_time DECIMAL(8,2),
    conversion_rate DECIMAL(5,2),
    booking_conversion_rate DECIMAL(5,2),
    -- NOVOS CAMPOS AI (usando campos existentes)
    ai_total_cost_usd DECIMAL(10,6),
    ai_total_tokens INTEGER,
    ai_avg_cost_per_conversation DECIMAL(10,6),
    ai_conversations_with_outcome INTEGER,
    ai_successful_outcomes INTEGER,
    ai_outcome_success_rate DECIMAL(5,2),
    top_conversation_outcome VARCHAR(50),
    most_used_ai_model VARCHAR(50)
) AS $$
DECLARE
    start_ts TIMESTAMP := start_date::timestamp;
    end_ts TIMESTAMP := end_date::timestamp;
BEGIN
    RETURN QUERY
    SELECT 
        -- Appointment metrics (existentes)
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
        ), 0) as total_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'confirmed'
        ), 0) as confirmed_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'cancelled'
        ), 0) as cancelled_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND a.status = 'completed'
        ), 0) as completed_appointments,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER 
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            AND a.status = 'pending'
        ), 0) as pending_appointments,
        
        -- Revenue metrics (existentes)
        COALESCE((
            SELECT SUM(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as total_revenue,
        
        COALESCE((
            SELECT AVG(COALESCE(a.final_price, a.quoted_price, 0))::DECIMAL(15,2)
            FROM appointments a 
            WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id 
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            AND a.status IN ('completed', 'confirmed')
        ), 0) as average_value,
        
        -- Customer metrics (existentes)
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_tenant_metrics_for_period.tenant_id
        ), 0) as total_customers,
        
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ut.first_interaction >= start_ts 
            AND ut.first_interaction <= end_ts
        ), 0) as new_customers,
        
        -- Service metrics (existentes)
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM services s 
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND s.is_active = true
        ), 0) as total_services,
        
        get_tenant_services_count_by_period(
            get_tenant_metrics_for_period.tenant_id,
            CASE 
                WHEN end_date - start_date <= 7 THEN '7d'
                WHEN end_date - start_date <= 30 THEN '30d'
                WHEN end_date - start_date <= 90 THEN '90d'
                ELSE '30d'
            END
        ) as services_count,
        
        COALESCE(ARRAY(
            SELECT DISTINCT s.name
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND a.start_time >= start_ts 
            AND a.start_time <= end_ts
            AND s.is_active = true
            ORDER BY s.name
        ), '{}') as services,
        
        COALESCE((
            SELECT s.name::VARCHAR(255)
            FROM services s
            JOIN appointments a ON a.service_id = s.id
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND a.created_at >= start_ts 
            AND a.created_at <= end_ts
            GROUP BY s.id, s.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), '') as most_popular_service,
        
        COALESCE((
            SELECT (COUNT(DISTINCT a.service_id)::DECIMAL / NULLIF(COUNT(DISTINCT s.id), 0) * 100)::DECIMAL(5,2)
            FROM services s
            LEFT JOIN appointments a ON a.service_id = s.id 
                AND a.tenant_id = get_tenant_metrics_for_period.tenant_id
                AND a.created_at >= start_ts 
                AND a.created_at <= end_ts
            WHERE s.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND s.is_active = true
        ), 0) as service_utilization_rate,
        
        -- Conversation metrics (existente)
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as total_conversations,
        
        COALESCE((
            SELECT (COUNT(CASE WHEN ch.intent_detected IS NOT NULL AND ch.confidence_score > 0.75 THEN 1 END)::DECIMAL 
                   / NULLIF(COUNT(*), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as ai_success_rate,
        
        COALESCE((
            SELECT AVG(COALESCE(ch.response_time, 0))::DECIMAL(8,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as avg_response_time,
        
        -- Conversion metrics (existentes)
        COALESCE((
            SELECT (COUNT(DISTINCT a.id)::DECIMAL / NULLIF(COUNT(DISTINCT ch.id), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch
            LEFT JOIN appointments a ON a.tenant_id = ch.tenant_id
                AND a.created_at >= ch.created_at 
                AND a.created_at <= ch.created_at + INTERVAL '7 days'
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as conversion_rate,
        
        COALESCE((
            SELECT (COUNT(DISTINCT a.id)::DECIMAL / NULLIF(COUNT(DISTINCT ch.id), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch
            LEFT JOIN appointments a ON a.tenant_id = ch.tenant_id
                AND a.created_at >= ch.created_at 
                AND a.created_at <= ch.created_at + INTERVAL '1 day'
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as booking_conversion_rate,

        -- === NOVOS CAMPOS AI COSTS (usando campos EXISTENTES) ===
        
        -- Custo total de AI usando campo api_cost_usd existente
        COALESCE((
            SELECT SUM(ch.api_cost_usd)::DECIMAL(10,6)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.api_cost_usd IS NOT NULL
        ), 0) as ai_total_cost_usd,
        
        -- Total de tokens usando campo tokens_used existente
        COALESCE((
            SELECT SUM(ch.tokens_used)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.tokens_used IS NOT NULL
        ), 0) as ai_total_tokens,
        
        -- Custo médio por conversação
        COALESCE((
            SELECT (SUM(ch.api_cost_usd) / NULLIF(COUNT(*), 0))::DECIMAL(10,6)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.api_cost_usd IS NOT NULL
            AND ch.api_cost_usd > 0
        ), 0) as ai_avg_cost_per_conversation,
        
        -- Conversações com outcome usando campo conversation_outcome existente
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.conversation_outcome IS NOT NULL
        ), 0) as ai_conversations_with_outcome,
        
        -- Outcomes bem-sucedidos
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled')
        ), 0) as ai_successful_outcomes,
        
        -- Taxa de sucesso de outcomes
        COALESCE((
            SELECT (COUNT(CASE WHEN ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled') THEN 1 END)::DECIMAL 
                   / NULLIF(COUNT(CASE WHEN ch.conversation_outcome IS NOT NULL THEN 1 END), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
        ), 0) as ai_outcome_success_rate,
        
        -- Outcome mais comum usando campo conversation_outcome existente
        COALESCE((
            SELECT ch.conversation_outcome::VARCHAR(50)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.conversation_outcome IS NOT NULL
            GROUP BY ch.conversation_outcome
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), 'unknown') as top_conversation_outcome,
        
        -- Modelo AI mais usado usando campo model_used existente
        COALESCE((
            SELECT ch.model_used::VARCHAR(50)
            FROM conversation_history ch 
            WHERE ch.tenant_id = get_tenant_metrics_for_period.tenant_id
            AND ch.created_at >= start_ts 
            AND ch.created_at <= end_ts
            AND ch.model_used IS NOT NULL
            GROUP BY ch.model_used
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), 'gpt-3.5-turbo') as most_used_ai_model;
END;
$$ LANGUAGE plpgsql;

-- 2. Atualizar get_platform_totals para incluir AI costs
CREATE OR REPLACE FUNCTION get_platform_totals(start_date DATE, end_date DATE)
RETURNS TABLE (
    total_tenants INTEGER,
    active_tenants INTEGER,
    total_revenue DECIMAL(15,2),
    total_appointments INTEGER,
    total_customers INTEGER,
    total_conversations INTEGER,
    -- NOVOS CAMPOS AI COSTS
    total_ai_cost_usd DECIMAL(15,2),
    total_ai_tokens BIGINT,
    avg_ai_cost_per_tenant DECIMAL(10,6),
    conversations_with_outcomes INTEGER,
    successful_ai_outcomes INTEGER,
    platform_ai_success_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT t.id)::INTEGER as total_tenants,
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END)::INTEGER as active_tenants,
        COALESCE(SUM(CASE 
            WHEN t.subscription_plan = 'free' THEN 0
            WHEN t.subscription_plan = 'pro' THEN 99
            WHEN t.subscription_plan = 'professional' THEN 199
            WHEN t.subscription_plan = 'enterprise' THEN 299
            ELSE 99
        END), 0)::DECIMAL(15,2) as total_revenue,
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM appointments a 
            WHERE a.created_at >= start_date::timestamp 
            AND a.created_at <= end_date::timestamp
        ), 0) as total_appointments,
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut 
            WHERE ut.first_interaction >= start_date::timestamp 
            AND ut.first_interaction <= end_date::timestamp
        ), 0) as total_customers,
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
        ), 0) as total_conversations,

        -- === NOVOS CAMPOS AI COSTS ===
        
        -- Custo total AI da plataforma
        COALESCE((
            SELECT SUM(ch.api_cost_usd)::DECIMAL(15,2)
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.api_cost_usd IS NOT NULL
        ), 0) as total_ai_cost_usd,
        
        -- Total tokens da plataforma
        COALESCE((
            SELECT SUM(ch.tokens_used)::BIGINT
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.tokens_used IS NOT NULL
        ), 0) as total_ai_tokens,
        
        -- Custo médio AI por tenant ativo
        COALESCE((
            SELECT (SUM(ch.api_cost_usd) / NULLIF(COUNT(DISTINCT ch.tenant_id), 0))::DECIMAL(10,6)
            FROM conversation_history ch 
            JOIN tenants t ON ch.tenant_id = t.id
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.api_cost_usd IS NOT NULL
            AND t.status = 'active'
        ), 0) as avg_ai_cost_per_tenant,
        
        -- Conversações com outcomes
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome IS NOT NULL
        ), 0) as conversations_with_outcomes,
        
        -- Outcomes bem-sucedidos da plataforma
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled')
        ), 0) as successful_ai_outcomes,
        
        -- Taxa de sucesso AI da plataforma
        COALESCE((
            SELECT (COUNT(CASE WHEN ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled') THEN 1 END)::DECIMAL 
                   / NULLIF(COUNT(CASE WHEN ch.conversation_outcome IS NOT NULL THEN 1 END), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch 
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
        ), 0) as platform_ai_success_rate

    FROM tenants t;
END;
$$ LANGUAGE plpgsql;

-- 3. Criar função específica para análise detalhada AI outcomes
CREATE OR REPLACE FUNCTION get_ai_outcomes_analysis(
    p_tenant_id UUID DEFAULT NULL,
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tenant_id UUID,
    business_name VARCHAR,
    total_conversations INTEGER,
    conversations_with_outcomes INTEGER,
    appointment_created_count INTEGER,
    info_request_count INTEGER,
    booking_abandoned_count INTEGER,
    timeout_abandoned_count INTEGER,
    successful_outcome_rate DECIMAL(5,2),
    total_ai_cost_usd DECIMAL(10,6),
    avg_cost_per_conversation DECIMAL(10,6),
    total_tokens INTEGER,
    avg_tokens_per_conversation DECIMAL(10,2),
    most_used_model VARCHAR(50),
    cost_efficiency_score DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.business_name,
        
        -- Contadores de conversações
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
        ), 0) as total_conversations,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome IS NOT NULL
        ), 0) as conversations_with_outcomes,
        
        -- Contadores por tipo de outcome
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome = 'appointment_created'
        ), 0) as appointment_created_count,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome = 'info_request_fulfilled'
        ), 0) as info_request_count,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome = 'booking_abandoned'
        ), 0) as booking_abandoned_count,
        
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.conversation_outcome = 'timeout_abandoned'
        ), 0) as timeout_abandoned_count,
        
        -- Taxa de sucesso
        COALESCE((
            SELECT (COUNT(CASE WHEN ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled') THEN 1 END)::DECIMAL 
                   / NULLIF(COUNT(CASE WHEN ch.conversation_outcome IS NOT NULL THEN 1 END), 0) * 100)::DECIMAL(5,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
        ), 0) as successful_outcome_rate,
        
        -- Métricas de custo AI
        COALESCE((
            SELECT SUM(ch.api_cost_usd)::DECIMAL(10,6)
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.api_cost_usd IS NOT NULL
        ), 0) as total_ai_cost_usd,
        
        COALESCE((
            SELECT (SUM(ch.api_cost_usd) / NULLIF(COUNT(*), 0))::DECIMAL(10,6)
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.api_cost_usd IS NOT NULL
            AND ch.api_cost_usd > 0
        ), 0) as avg_cost_per_conversation,
        
        COALESCE((
            SELECT SUM(ch.tokens_used)::INTEGER
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.tokens_used IS NOT NULL
        ), 0) as total_tokens,
        
        COALESCE((
            SELECT (SUM(ch.tokens_used) / NULLIF(COUNT(*), 0))::DECIMAL(10,2)
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.tokens_used IS NOT NULL
            AND ch.tokens_used > 0
        ), 0) as avg_tokens_per_conversation,
        
        -- Modelo mais usado
        COALESCE((
            SELECT ch.model_used::VARCHAR(50)
            FROM conversation_history ch 
            WHERE ch.tenant_id = t.id
            AND ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
            AND ch.model_used IS NOT NULL
            GROUP BY ch.model_used
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), 'gpt-3.5-turbo') as most_used_model,
        
        -- Score de eficiência de custo (outcomes successful / custo)
        CASE 
            WHEN COALESCE((SELECT SUM(ch.api_cost_usd) FROM conversation_history ch WHERE ch.tenant_id = t.id AND ch.created_at >= start_date::timestamp AND ch.created_at <= end_date::timestamp), 0) > 0
            THEN (
                COALESCE((
                    SELECT COUNT(*)::DECIMAL
                    FROM conversation_history ch 
                    WHERE ch.tenant_id = t.id
                    AND ch.created_at >= start_date::timestamp 
                    AND ch.created_at <= end_date::timestamp
                    AND ch.conversation_outcome IN ('appointment_created', 'appointment_confirmed', 'appointment_rescheduled')
                ), 0) / (
                    SELECT SUM(ch.api_cost_usd) 
                    FROM conversation_history ch 
                    WHERE ch.tenant_id = t.id
                    AND ch.created_at >= start_date::timestamp 
                    AND ch.created_at <= end_date::timestamp
                    AND ch.api_cost_usd IS NOT NULL
                ) * 100
            )::DECIMAL(5,2)
            ELSE 0::DECIMAL(5,2)
        END as cost_efficiency_score
    
    FROM tenants t
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
    AND t.status = 'active'
    ORDER BY total_ai_cost_usd DESC;
END;
$$ LANGUAGE plpgsql;

-- 4. Grants para as novas funções
GRANT EXECUTE ON FUNCTION get_ai_outcomes_analysis(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_metrics_for_period(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_totals(DATE, DATE) TO authenticated;

-- 5. Comentários de documentação
COMMENT ON FUNCTION get_ai_outcomes_analysis IS 'Análise detalhada de AI outcomes usando campos existentes da conversation_history';
COMMENT ON FUNCTION get_tenant_metrics_for_period IS 'Métricas de tenant expandidas com custos AI usando campos existentes';
COMMENT ON FUNCTION get_platform_totals IS 'Totais da plataforma expandidos com métricas AI usando campos existentes';

-- ✅ RESUMO DA INTEGRAÇÃO:
-- 1. Usa campos EXISTENTES: conversation_outcome, tokens_used, api_cost_usd, model_used
-- 2. Não cria novas tabelas ou estruturas desnecessárias  
-- 3. Mantém compatibilidade com procedures existentes
-- 4. Adiciona métricas AI sem quebrar arquitetura atual
-- 5. Aproveita infrastructure completa já implementada

RAISE NOTICE '🚀 AI Costs integrados nas procedures existentes!';
RAISE NOTICE '📊 Usando campos: conversation_outcome, tokens_used, api_cost_usd, model_used';
RAISE NOTICE '🎯 Procedures atualizadas: get_tenant_metrics_for_period, get_platform_totals';
RAISE NOTICE '✅ Nova função: get_ai_outcomes_analysis para análise detalhada';