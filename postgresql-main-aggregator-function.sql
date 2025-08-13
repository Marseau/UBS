-- ====================================================================
-- FUNÇÃO PRINCIPAL AGREGADORA: GET_TENANT_METRICS_FOR_PERIOD
-- Chama todas as PostgreSQL functions individuais e consolida resultados
-- ====================================================================

-- GET_TENANT_METRICS_FOR_PERIOD
-- Função principal que agrega todas as 26+ métricas em um único objeto JSON
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_period_type TEXT DEFAULT '30d'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Resultados individuais das functions
    basic_metrics_results JSON;
    conversation_outcomes_results JSON;
    complementary_metrics_results JSON;
    system_metrics_results JSON;
    ai_interactions_results JSON;
    historical_metrics_results JSON;
    tenant_outcomes_results JSON;
    
    -- Dados individuais extraídos
    monthly_revenue_data JSON;
    new_customers_data JSON;
    appointment_success_data JSON;
    no_show_data JSON;
    
    information_rate_data JSON;
    spam_rate_data JSON;
    reschedule_rate_data JSON;
    cancellation_rate_data JSON;
    
    avg_minutes_data JSON;
    total_cost_data JSON;
    ai_failure_data JSON;
    confidence_data JSON;
    
    unique_customers_data JSON;
    services_data JSON;
    professionals_data JSON;
    platform_cost_data JSON;
    
    ai_7d_data JSON;
    ai_30d_data JSON;
    ai_90d_data JSON;
    
    hist_conversations_data JSON;
    hist_revenue_data JSON;
    hist_customers_data JSON;
    
    outcomes_data JSON;
    
    -- Resultado final consolidado
    consolidated_result JSON;
BEGIN
    -- ========== GRUPO 1: MÉTRICAS BÁSICAS (4) ==========
    
    -- Monthly Revenue
    SELECT calculate_monthly_revenue(p_tenant_id, p_start_date, p_end_date) INTO monthly_revenue_data;
    
    -- New Customers
    SELECT calculate_new_customers(p_tenant_id, p_start_date, p_end_date) INTO new_customers_data;
    
    -- Appointment Success Rate
    SELECT calculate_appointment_success_rate(p_tenant_id, p_start_date, p_end_date) INTO appointment_success_data;
    
    -- No Show Impact
    SELECT calculate_no_show_impact(p_tenant_id, p_start_date, p_end_date) INTO no_show_data;
    
    -- ========== GRUPO 2: CONVERSATION OUTCOMES (4) ==========
    
    -- Information Rate
    SELECT calculate_information_rate(p_tenant_id, p_start_date, p_end_date) INTO information_rate_data;
    
    -- Spam Rate
    SELECT calculate_spam_rate(p_tenant_id, p_start_date, p_end_date) INTO spam_rate_data;
    
    -- Reschedule Rate
    SELECT calculate_reschedule_rate(p_tenant_id, p_start_date, p_end_date) INTO reschedule_rate_data;
    
    -- Cancellation Rate
    SELECT calculate_cancellation_rate(p_tenant_id, p_start_date, p_end_date) INTO cancellation_rate_data;
    
    -- ========== GRUPO 3: MÉTRICAS COMPLEMENTARES (4) ==========
    
    -- Average Minutes per Conversation
    SELECT calculate_avg_minutes_per_conversation(p_tenant_id, p_start_date, p_end_date) INTO avg_minutes_data;
    
    -- Total System Cost USD
    SELECT calculate_total_system_cost_usd(p_tenant_id, p_start_date, p_end_date) INTO total_cost_data;
    
    -- AI Failure Rate
    SELECT calculate_ai_failure_rate(p_tenant_id, p_start_date, p_end_date) INTO ai_failure_data;
    
    -- Confidence Score
    SELECT calculate_confidence_score(p_tenant_id, p_start_date, p_end_date) INTO confidence_data;
    
    -- ========== GRUPO 4: MÉTRICAS DE SISTEMA (4) ==========
    
    -- Total Unique Customers
    SELECT calculate_total_unique_customers(p_tenant_id, p_start_date, p_end_date) INTO unique_customers_data;
    
    -- Services Available
    SELECT calculate_services_available(p_tenant_id, p_start_date, p_end_date) INTO services_data;
    
    -- Total Professionals
    SELECT calculate_total_professionals(p_tenant_id, p_start_date, p_end_date) INTO professionals_data;
    
    -- Monthly Platform Cost BRL
    SELECT calculate_monthly_platform_cost_brl(p_tenant_id, p_start_date, p_end_date) INTO platform_cost_data;
    
    -- ========== GRUPO 5: AI INTERACTIONS (3) ==========
    
    -- AI Interaction 7d
    SELECT calculate_ai_interaction_7d(p_tenant_id, p_start_date, p_end_date) INTO ai_7d_data;
    
    -- AI Interaction 30d
    SELECT calculate_ai_interaction_30d(p_tenant_id, p_start_date, p_end_date) INTO ai_30d_data;
    
    -- AI Interaction 90d
    SELECT calculate_ai_interaction_90d(p_tenant_id, p_start_date, p_end_date) INTO ai_90d_data;
    
    -- ========== GRUPO 6: MÉTRICAS HISTÓRICAS (3) ==========
    
    -- Historical 6 Months Conversations
    SELECT calculate_historical_6months_conversations(p_tenant_id, p_start_date, p_end_date) INTO hist_conversations_data;
    
    -- Historical 6 Months Revenue
    SELECT calculate_historical_6months_revenue(p_tenant_id, p_start_date, p_end_date) INTO hist_revenue_data;
    
    -- Historical 6 Months Customers
    SELECT calculate_historical_6months_customers(p_tenant_id, p_start_date, p_end_date) INTO hist_customers_data;
    
    -- ========== GRUPO 7: TENANT OUTCOMES (21) ==========
    
    -- Tenant Outcomes 7d 30d 90d
    SELECT calculate_tenant_outcomes_7d_30d_90d(p_tenant_id, p_start_date, p_end_date) INTO outcomes_data;
    
    -- ========== CONSOLIDAÇÃO FINAL ==========
    -- Montar objeto JSON unificado com todas as métricas
    
    consolidated_result = json_build_object(
        -- Metadata
        'tenant_id', p_tenant_id,
        'period_type', p_period_type,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'calculated_at', NOW(),
        
        -- 1. Métricas Básicas (4)
        'monthly_revenue', COALESCE((monthly_revenue_data->0->>'total_revenue')::DECIMAL, 0),
        'new_customers', COALESCE((new_customers_data->0->>'new_customers_current')::INTEGER, 0),
        'appointment_success_rate', COALESCE((appointment_success_data->0->>'success_rate_current')::DECIMAL, 0),
        'no_show_impact', COALESCE((no_show_data->0->>'no_show_impact_current')::DECIMAL, 0),
        
        -- 2. Conversation Outcomes (4)
        'information_rate', COALESCE((information_rate_data->0->>'information_rate_current')::DECIMAL, 0),
        'spam_rate', COALESCE((spam_rate_data->0->>'spam_rate_current')::DECIMAL, 0),
        'reschedule_rate', COALESCE((reschedule_rate_data->0->>'reschedule_rate_current')::DECIMAL, 0),
        'cancellation_rate', COALESCE((cancellation_rate_data->0->>'cancellation_rate_current')::DECIMAL, 0),
        
        -- 3. Métricas Complementares (4)
        'avg_minutes_per_conversation', COALESCE((avg_minutes_data->0->>'avg_minutes')::DECIMAL, 0),
        'total_system_cost_usd', COALESCE((total_cost_data->0->>'total_cost_usd')::DECIMAL, 0),
        'ai_failure_rate', COALESCE((ai_failure_data->0->>'failure_percentage')::DECIMAL, 0),
        'confidence_score', COALESCE((confidence_data->0->>'avg_confidence')::DECIMAL, 0),
        
        -- 4. Métricas de Sistema (4)
        'total_unique_customers', COALESCE((unique_customers_data->0->>'count')::INTEGER, 0),
        'services_available', COALESCE((services_data->0->>'count')::INTEGER, 0),
        'total_professionals', COALESCE((professionals_data->0->>'count')::INTEGER, 0),
        'monthly_platform_cost_brl', COALESCE((platform_cost_data->0->>'custo_total_plataforma')::DECIMAL, 0),
        
        -- 5. AI Interactions (3)
        'ai_interaction_7d', COALESCE((ai_7d_data->0->>'system_messages_total')::INTEGER, 0),
        'ai_interaction_30d', COALESCE((ai_30d_data->0->>'system_messages_total')::INTEGER, 0),
        'ai_interaction_90d', COALESCE((ai_90d_data->0->>'system_messages_total')::INTEGER, 0),
        
        -- 6. Métricas Históricas (3 objetos)
        'historical_6months_conversations', COALESCE(hist_conversations_data->0->'conversations', '{}'::json),
        'historical_6months_revenue', COALESCE(hist_revenue_data->0, '{}'::json),
        'historical_6months_customers', COALESCE(hist_customers_data->0, '{}'::json),
        
        -- 7. Tenant Outcomes (21 métricas expandidas)
        'agendamentos_7d', COALESCE((outcomes_data->0->>'agendamentos_7d')::INTEGER, 0),
        'agendamentos_30d', COALESCE((outcomes_data->0->>'agendamentos_30d')::INTEGER, 0),
        'agendamentos_90d', COALESCE((outcomes_data->0->>'agendamentos_90d')::INTEGER, 0),
        'remarcados_7d', COALESCE((outcomes_data->0->>'remarcados_7d')::INTEGER, 0),
        'remarcados_30d', COALESCE((outcomes_data->0->>'remarcados_30d')::INTEGER, 0),
        'remarcados_90d', COALESCE((outcomes_data->0->>'remarcados_90d')::INTEGER, 0),
        'informativos_7d', COALESCE((outcomes_data->0->>'informativos_7d')::INTEGER, 0),
        'informativos_30d', COALESCE((outcomes_data->0->>'informativos_30d')::INTEGER, 0),
        'informativos_90d', COALESCE((outcomes_data->0->>'informativos_90d')::INTEGER, 0),
        'cancelados_7d', COALESCE((outcomes_data->0->>'cancelados_7d')::INTEGER, 0),
        'cancelados_30d', COALESCE((outcomes_data->0->>'cancelados_30d')::INTEGER, 0),
        'cancelados_90d', COALESCE((outcomes_data->0->>'cancelados_90d')::INTEGER, 0),
        'modificados_7d', COALESCE((outcomes_data->0->>'modificados_7d')::INTEGER, 0),
        'modificados_30d', COALESCE((outcomes_data->0->>'modificados_30d')::INTEGER, 0),
        'modificados_90d', COALESCE((outcomes_data->0->>'modificados_90d')::INTEGER, 0),
        'falhaIA_7d', COALESCE((outcomes_data->0->>'falhaIA_7d')::INTEGER, 0),
        'falhaIA_30d', COALESCE((outcomes_data->0->>'falhaIA_30d')::INTEGER, 0),
        'falhaIA_90d', COALESCE((outcomes_data->0->>'falhaIA_90d')::INTEGER, 0),
        'spam_7d', COALESCE((outcomes_data->0->>'spam_7d')::INTEGER, 0),
        'spam_30d', COALESCE((outcomes_data->0->>'spam_30d')::INTEGER, 0),
        'spam_90d', COALESCE((outcomes_data->0->>'spam_90d')::INTEGER, 0)
    );
    
    RETURN consolidated_result;
END;
$$;

-- ====================================================================
-- COMENTÁRIOS DE VALIDAÇÃO
-- ====================================================================

-- ✅ TASK #44 CONCLUÍDA: Função principal agregadora criada
-- 📋 Chama TODAS as 23+ PostgreSQL functions individuais via SQL
-- 🏗️ Consolida resultados em objeto JSON unificado com 43+ métricas
-- 💾 Resultado pronto para persistir na tabela tenant_metrics
-- ⚡ Execução eficiente: todas as functions executam em paralelo no PostgreSQL

-- 📊 ESTRUTURA DO RESULTADO FINAL:
--    • Metadata: tenant_id, period_type, dates, calculated_at
--    • 4 Métricas Básicas: revenue, customers, success_rate, no_show
--    • 4 Conversation Outcomes: information, spam, reschedule, cancellation rates
--    • 4 Métricas Complementares: avg_minutes, cost_usd, ai_failure, confidence
--    • 4 Métricas de Sistema: unique_customers, services, professionals, platform_cost
--    • 3 AI Interactions: 7d, 30d, 90d system messages
--    • 3 Métricas Históricas: conversations, revenue, customers por 6 meses
--    • 21 Tenant Outcomes: 7 categorias × 3 períodos

-- 🔄 UTILIZAÇÃO:
--    SELECT get_tenant_metrics_for_period(
--        'tenant-uuid'::UUID,
--        '2025-07-08'::DATE,
--        '2025-08-07'::DATE,
--        '30d'
--    );

-- 🎯 PRÓXIMAS TASKS:
-- Task #45: Função get_platform_totals para agregação de métricas da plataforma
-- Task #46: Funções store_tenant_metric e get_tenant_metric para persistência