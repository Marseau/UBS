-- =====================================================
-- FIXED OPTIMIZED PLATFORM METRICS FUNCTION
-- =====================================================
-- Performance-optimized version without window function in aggregate
-- Targets: Function execution < 150ms, 30-day processing < 15s
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_enhanced_platform_metrics_optimized(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    processed_tenants INTEGER,
    platform_totals JSONB,
    execution_time_ms INTEGER
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_execution_time INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_processed_tenants INTEGER := 0;
    v_platform_totals JSONB;
    
    -- Platform aggregations (using more efficient data types)
    v_platform_total_revenue DECIMAL(12,2) := 0;
    v_platform_total_appointments INTEGER := 0;
    v_platform_total_customers INTEGER := 0;
    v_platform_total_ai_interactions INTEGER := 0;
    v_platform_active_tenants INTEGER := 0;
    v_platform_total_chat_minutes INTEGER := 0;
    v_platform_mrr DECIMAL(12,2) := 0;
    
    -- Advanced platform metrics
    v_platform_receita_uso_ratio DECIMAL(10,2) := 0;
    v_platform_operational_efficiency_pct DECIMAL(5,2) := 0;
    v_platform_spam_rate_pct DECIMAL(5,2) := 0;
    v_platform_revenue_usage_distortion_index DECIMAL(8,2) := 0;
    
BEGIN
    v_start_time := clock_timestamp();
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    v_end_date := p_calculation_date;
    
    RAISE NOTICE '🚀 Starting FIXED OPTIMIZED platform metrics calculation for period: % to %', v_start_date, v_end_date;
    
    -- =====================================================
    -- OPTIMIZATION 1: SIMPLIFIED AGGREGATED QUERY APPROACH
    -- =====================================================
    -- Fixed: Remove window functions from aggregates
    
    RAISE NOTICE '⚡ Using fixed optimized aggregation queries...';
    
    -- Get platform-wide metrics in single queries with proper indexes
    WITH tenant_metrics AS (
        SELECT 
            t.id as tenant_id,
            t.business_name,
            COALESCE(t.monthly_revenue, 79.90) as monthly_revenue,
            
            -- Conversation metrics (simplified without window functions)
            COALESCE(conv_stats.total_conversations, 0) as conversations,
            COALESCE(conv_stats.valid_conversations, 0) as valid_conversations,
            COALESCE(conv_stats.spam_conversations, 0) as spam_conversations,
            COALESCE(conv_stats.ai_interactions, 0) as ai_interactions,
            
            -- Appointment metrics (optimized with indexes)
            COALESCE(appt_stats.appointment_count, 0) as appointments,
            COALESCE(appt_stats.customer_count, 0) as customers
            
        FROM tenants t
        
        -- LEFT JOIN optimized conversation statistics (FIXED)
        LEFT JOIN (
            SELECT 
                tenant_id,
                COUNT(*) FILTER (WHERE message_type = 'user') as total_conversations,
                COUNT(*) FILTER (WHERE message_type = 'user' AND confidence_score >= 0.7) as valid_conversations,
                COUNT(*) FILTER (WHERE message_type = 'user' AND (confidence_score < 0.7 OR confidence_score IS NULL)) as spam_conversations,
                COUNT(*) FILTER (WHERE message_type = 'assistant') as ai_interactions
            FROM conversation_history
            WHERE created_at >= v_start_date 
              AND created_at <= v_end_date
              AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
            GROUP BY tenant_id
        ) conv_stats ON t.id = conv_stats.tenant_id
        
        -- LEFT JOIN optimized appointment statistics  
        LEFT JOIN (
            SELECT 
                tenant_id,
                COUNT(*) as appointment_count,
                COUNT(DISTINCT user_id) as customer_count
            FROM appointments
            WHERE created_at >= v_start_date 
              AND created_at <= v_end_date
              AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
            GROUP BY tenant_id
        ) appt_stats ON t.id = appt_stats.tenant_id
        
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
          AND t.status = 'active'
    ),
    
    -- Calculate advanced metrics in CTE (SIMPLIFIED)
    enhanced_metrics AS (
        SELECT 
            *,
            -- Simplified chat duration (assume 2 minutes per conversation average)
            (conversations * 2) as chat_minutes,
            
            -- Revenue/Usage ratio (simplified)
            CASE WHEN conversations > 0 
                THEN (monthly_revenue / GREATEST(conversations * 2, 1)) 
                ELSE 0 END as receita_uso_ratio,
                
            -- Conversion rate
            CASE WHEN conversations > 0 
                THEN (appointments * 100.0 / conversations) 
                ELSE 0 END as conversion_rate,
                
            -- Spam score  
            CASE WHEN conversations > 0 
                THEN (valid_conversations * 100.0 / conversations) 
                ELSE 100 END as spam_score,
                
            -- Efficiency score (simplified)
            CASE WHEN conversations > 0 
                THEN (
                    (LEAST(appointments * 100.0 / conversations, 100) * 0.6) +
                    (LEAST(valid_conversations * 100.0 / conversations * 100, 100) * 0.4)
                )
                ELSE 0 END as efficiency_score
                
        FROM tenant_metrics
    )
    
    -- =====================================================
    -- OPTIMIZATION 2: BULK INSERT/UPDATE OPERATIONS  
    -- =====================================================
    
    -- Insert or update all tenant records in bulk
    INSERT INTO ubs_metric_system (
        tenant_id,
        calculation_date,
        period_days,
        data_source,
        tenant_revenue_value,
        tenant_appointments_count,
        tenant_customers_count,
        tenant_ai_interactions,
        tenant_avg_chat_duration_minutes,
        tenant_spam_detection_score,
        tenant_spam_conversations,
        tenant_valid_conversations,
        tenant_revenue_per_chat_minute,
        tenant_conversation_to_appointment_rate_pct,
        tenant_efficiency_score,
        tenant_risk_level,
        created_at,
        updated_at
    )
    SELECT 
        tenant_id,
        p_calculation_date,
        p_period_days,
        'optimized_function_fixed',
        monthly_revenue,
        appointments,
        customers,
        ai_interactions,
        CASE WHEN conversations > 0 THEN (chat_minutes::DECIMAL / conversations) ELSE 0 END,
        spam_score,
        spam_conversations,
        valid_conversations,
        receita_uso_ratio,
        conversion_rate,
        efficiency_score,
        CASE 
            WHEN efficiency_score >= 80 THEN 'Baixo'
            WHEN efficiency_score >= 60 THEN 'Médio'
            ELSE 'Alto'
        END,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM enhanced_metrics
    ON CONFLICT (tenant_id, calculation_date, period_days, data_source) 
    DO UPDATE SET
        tenant_revenue_value = EXCLUDED.tenant_revenue_value,
        tenant_appointments_count = EXCLUDED.tenant_appointments_count,
        tenant_customers_count = EXCLUDED.tenant_customers_count,
        tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
        tenant_avg_chat_duration_minutes = EXCLUDED.tenant_avg_chat_duration_minutes,
        tenant_spam_detection_score = EXCLUDED.tenant_spam_detection_score,
        tenant_spam_conversations = EXCLUDED.tenant_spam_conversations,
        tenant_valid_conversations = EXCLUDED.tenant_valid_conversations,
        tenant_revenue_per_chat_minute = EXCLUDED.tenant_revenue_per_chat_minute,
        tenant_conversation_to_appointment_rate_pct = EXCLUDED.tenant_conversation_to_appointment_rate_pct,
        tenant_efficiency_score = EXCLUDED.tenant_efficiency_score,
        tenant_risk_level = EXCLUDED.tenant_risk_level,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Get platform totals from aggregated data
    SELECT 
        COUNT(*),
        SUM(monthly_revenue),
        SUM(appointments),
        SUM(customers),
        SUM(ai_interactions),
        SUM(chat_minutes),
        COUNT(*) * 79.90, -- Platform MRR
        
        -- Advanced metrics (simplified)
        CASE WHEN SUM(chat_minutes) > 0 
            THEN (COUNT(*) * 79.90 / SUM(chat_minutes)) 
            ELSE 0 END,
        CASE WHEN SUM(conversations) > 0 
            THEN (SUM(appointments) * 100.0 / SUM(conversations)) 
            ELSE 0 END,
        CASE WHEN SUM(conversations) > 0 
            THEN (SUM(spam_conversations) * 100.0 / SUM(conversations)) 
            ELSE 0 END
            
    INTO 
        v_processed_tenants,
        v_platform_total_revenue,
        v_platform_total_appointments,
        v_platform_total_customers,
        v_platform_total_ai_interactions,
        v_platform_total_chat_minutes,
        v_platform_mrr,
        v_platform_receita_uso_ratio,
        v_platform_operational_efficiency_pct,
        v_platform_spam_rate_pct
    FROM enhanced_metrics;
    
    -- =====================================================
    -- OPTIMIZATION 3: SIMPLIFIED INSIGHTS GENERATION
    -- =====================================================
    
    -- Generate platform-level record
    INSERT INTO ubs_metric_system (
        tenant_id,
        calculation_date,
        period_days,
        data_source,
        platform_total_revenue,
        platform_total_appointments,
        platform_total_customers,
        platform_total_ai_interactions,
        platform_active_tenants,
        platform_mrr,
        platform_total_chat_minutes,
        platform_receita_uso_ratio,
        platform_operational_efficiency_pct,
        platform_spam_rate_pct,
        platform_revenue_usage_distortion_index,
        created_at,
        updated_at
    ) VALUES (
        NULL, -- tenant_id NULL = platform-level metrics
        p_calculation_date,
        p_period_days,
        'optimized_function_fixed',
        v_platform_total_revenue,
        v_platform_total_appointments,
        v_platform_total_customers,
        v_platform_total_ai_interactions,
        v_processed_tenants,
        v_platform_mrr,
        v_platform_total_chat_minutes,
        v_platform_receita_uso_ratio,
        v_platform_operational_efficiency_pct,
        v_platform_spam_rate_pct,
        1.5, -- Simplified distortion index
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (tenant_id, calculation_date, period_days, data_source) 
    WHERE tenant_id IS NULL
    DO UPDATE SET
        platform_total_revenue = EXCLUDED.platform_total_revenue,
        platform_total_appointments = EXCLUDED.platform_total_appointments,
        platform_total_customers = EXCLUDED.platform_total_customers,
        platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
        platform_active_tenants = EXCLUDED.platform_active_tenants,
        platform_mrr = EXCLUDED.platform_mrr,
        platform_total_chat_minutes = EXCLUDED.platform_total_chat_minutes,
        platform_receita_uso_ratio = EXCLUDED.platform_receita_uso_ratio,
        platform_operational_efficiency_pct = EXCLUDED.platform_operational_efficiency_pct,
        platform_spam_rate_pct = EXCLUDED.platform_spam_rate_pct,
        platform_revenue_usage_distortion_index = EXCLUDED.platform_revenue_usage_distortion_index,
        updated_at = CURRENT_TIMESTAMP;
    
    -- =====================================================
    -- FINALIZE AND RETURN RESULTS
    -- =====================================================
    
    v_end_time := clock_timestamp();
    v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
    
    -- Build platform totals JSON
    v_platform_totals := jsonb_build_object(
        'total_revenue', v_platform_total_revenue,
        'total_appointments', v_platform_total_appointments,
        'total_customers', v_platform_total_customers,
        'total_ai_interactions', v_platform_total_ai_interactions,
        'active_tenants', v_processed_tenants,
        'platform_mrr', v_platform_mrr,
        'total_chat_minutes', v_platform_total_chat_minutes,
        'receita_uso_ratio', v_platform_receita_uso_ratio,
        'operational_efficiency_pct', v_platform_operational_efficiency_pct,
        'spam_rate_pct', v_platform_spam_rate_pct
    );
    
    RAISE NOTICE '✅ FIXED OPTIMIZED calculation completed! Tenants: %, Time: %ms', v_processed_tenants, v_execution_time;
    
    RETURN QUERY SELECT 
        true as success,
        v_processed_tenants,
        v_platform_totals,
        v_execution_time;
    
EXCEPTION
    WHEN OTHERS THEN
        v_end_time := clock_timestamp();
        v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
        
        RAISE NOTICE '❌ Error in fixed optimized calculation: % - %', SQLSTATE, SQLERRM;
        
        RETURN QUERY SELECT 
            false as success,
            v_processed_tenants,
            jsonb_build_object('error', SQLERRM, 'execution_time_ms', v_execution_time),
            v_execution_time;
END;
$$;

-- =====================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON FUNCTION calculate_enhanced_platform_metrics_optimized IS 
'FIXED optimized version of platform metrics calculation with:
- Removed window functions from aggregate queries
- Single aggregated queries instead of tenant loops
- Bulk insert/update operations
- Proper use of database indexes
- Simplified calculations for better performance
- Target: <150ms execution time for 7-day periods
- Target: <15s execution time for 30-day periods with 400+ tenants';