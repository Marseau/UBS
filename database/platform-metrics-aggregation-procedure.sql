-- =====================================================
-- PLATFORM METRICS AGGREGATION PROCEDURE
-- Agrega métricas de tenant_metrics para platform_metrics
-- Baseado na metodologia COLEAM00 para UBS (Universal Booking System)
-- 
-- LÓGICA: MRR da Plataforma = SUM(platform_subscription_cost) de todos tenants
-- =====================================================

-- Ensure platform_metrics table exists with proper structure
CREATE TABLE IF NOT EXISTS platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    period VARCHAR(10) NOT NULL, -- '7d', '30d', '90d'
    
    -- Core platform MRR (from tenant subscription costs)
    platform_mrr DECIMAL(15,2) DEFAULT 0,
    
    -- Aggregated operational metrics
    total_tenants_processed INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_ai_interactions INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    
    -- Average performance metrics (weighted)
    avg_appointment_success_rate DECIMAL(5,2) DEFAULT 0,
    avg_conversion_rate DECIMAL(5,2) DEFAULT 0,
    avg_customer_satisfaction_score DECIMAL(3,1) DEFAULT 0,
    avg_health_score INTEGER DEFAULT 0,
    
    -- Cost and profitability metrics  
    total_platform_costs DECIMAL(15,2) DEFAULT 0,
    total_platform_margin DECIMAL(15,2) DEFAULT 0,
    avg_margin_percentage DECIMAL(5,2) DEFAULT 0,
    profitable_tenants_count INTEGER DEFAULT 0,
    
    -- Metadata
    data_source VARCHAR(100) DEFAULT 'tenant_metrics_aggregation',
    aggregation_method VARCHAR(50) DEFAULT 'sum_and_weighted_average',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint per date/period
    UNIQUE(calculation_date, period)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_metrics_date_period ON platform_metrics(calculation_date, period);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_created_at ON platform_metrics(created_at);

-- =====================================================
-- MAIN AGGREGATION PROCEDURE
-- =====================================================

DROP FUNCTION IF EXISTS aggregate_platform_metrics_from_tenants(date, text);

CREATE OR REPLACE FUNCTION aggregate_platform_metrics_from_tenants(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_specific_period text DEFAULT NULL -- '7d', '30d', '90d', or NULL for all
) RETURNS json AS $$
DECLARE
    v_period_list text[];
    v_period text;
    v_processed_periods text[] := '{}';
    v_execution_start TIMESTAMP := clock_timestamp();
    v_total_aggregations INTEGER := 0;
    v_result json;
BEGIN
    RAISE NOTICE 'Starting platform metrics aggregation from tenant_metrics';
    RAISE NOTICE 'Target date: %, Specific period: %', p_calculation_date, COALESCE(p_specific_period, 'ALL');
    
    -- Determine which periods to process
    IF p_specific_period IS NOT NULL THEN
        v_period_list := ARRAY[p_specific_period];
    ELSE
        v_period_list := ARRAY['7d', '30d', '90d'];
    END IF;
    
    -- Process each period
    FOREACH v_period IN ARRAY v_period_list
    LOOP
        DECLARE
            v_platform_mrr DECIMAL(15,2) := 0;
            v_total_tenants INTEGER := 0;
            v_active_tenants INTEGER := 0;
            v_total_revenue DECIMAL(15,2) := 0;
            v_total_appointments INTEGER := 0;
            v_total_customers INTEGER := 0;
            v_total_ai_interactions INTEGER := 0;
            v_total_conversations INTEGER := 0;
            v_total_platform_costs DECIMAL(15,2) := 0;
            v_total_platform_margin DECIMAL(15,2) := 0;
            v_profitable_tenants INTEGER := 0;
            
            -- AI Costs aggregation (NEW - CRÍTICO)
            v_total_ai_cost_usd DECIMAL(15,6) := 0;
            v_total_ai_tokens INTEGER := 0;
            v_ai_cost_efficiency_avg DECIMAL(10,4) := 0;
            v_tenants_with_ai_costs INTEGER := 0;
            
            -- Conversation Outcomes aggregation (NEW - MUITO IMPORTANTE)  
            v_total_successful_outcomes INTEGER := 0;
            v_total_business_outcomes INTEGER := 0;
            v_weighted_satisfaction_score DECIMAL(15,4) := 0;
            v_weighted_ai_confidence DECIMAL(15,4) := 0;
            v_total_conversations_with_outcomes INTEGER := 0;
            
            -- Weighted averages (need to calculate properly)
            v_weighted_success_rate DECIMAL(15,4) := 0;
            v_weighted_conversion_rate DECIMAL(15,4) := 0;
            v_weighted_satisfaction DECIMAL(15,4) := 0;
            v_weighted_health_score DECIMAL(15,4) := 0;
            v_weighted_margin_pct DECIMAL(15,4) := 0;
            
            v_total_appointments_for_weights INTEGER := 0; -- For weighted averages
            
        BEGIN
            RAISE NOTICE 'Processing period: %', v_period;
            
            -- =====================================================
            -- AGGREGATE FROM TENANT_METRICS TABLE
            -- =====================================================
            
            -- Main aggregation query - extract all metrics from JSONB in single pass
            SELECT 
                -- Basic counts
                COUNT(*),
                COUNT(CASE WHEN 
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0) > 0 
                    THEN 1 END),
                
                -- Platform MRR = SUM(platform_subscription_cost from financial_metrics)
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'platform_subscription_cost')::decimal, 0)
                ), 0),
                
                -- Revenue totals
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'tenant_revenue')::decimal, 0)
                ), 0),
                
                -- Operational totals
                COALESCE(SUM(
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'customer_metrics'->>'customers_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes'->>'ai_interactions_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes'->>'conversations_total')::integer, 0)
                ), 0),
                
                -- Cost and margin totals
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'total_platform_cost')::decimal, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'total_margin_usd')::decimal, 0)
                ), 0),
                
                -- Count profitable tenants
                COUNT(CASE WHEN 
                    COALESCE((metric_data->'financial_metrics'->>'is_profitable')::boolean, false) = true 
                    THEN 1 END),
                    
                -- Weighted averages (multiply by appointments for weighting)
                COALESCE(SUM(
                    COALESCE((metric_data->'appointment_metrics'->>'appointment_success_rate')::decimal, 0) * 
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes'->>'conversion_rate')::decimal, 0) * 
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes'->>'customer_satisfaction_score')::decimal, 0) * 
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'tenant_outcomes'->>'health_score')::integer, 0) * 
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'financial_metrics'->>'margin_percentage')::decimal, 0) * 
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                
                -- Total appointments for weighted average calculation
                COALESCE(SUM(
                    COALESCE((metric_data->'appointment_metrics'->>'appointments_total')::integer, 0)
                ), 0),
                
                -- =====================================================
                -- AI COSTS AGGREGATION (NEW - CRÍTICO)
                -- =====================================================
                COALESCE(SUM(
                    COALESCE((metric_data->'ai_costs_metrics'->>'total_cost_usd')::decimal, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'ai_costs_metrics'->>'total_tokens')::integer, 0)
                ), 0),
                COALESCE(AVG(
                    COALESCE((metric_data->'ai_costs_metrics'->>'efficiency_score')::decimal, 0)
                ), 0),
                COUNT(CASE WHEN 
                    COALESCE((metric_data->'ai_costs_metrics'->>'total_cost_usd')::decimal, 0) > 0 
                    THEN 1 END),
                    
                -- =====================================================
                -- CONVERSATION OUTCOMES AGGREGATION (NEW - MUITO IMPORTANTE)
                -- =====================================================
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'successful_outcomes')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'business_outcomes_achieved')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'avg_satisfaction_score')::decimal, 0) * 
                    COALESCE((metric_data->'conversation_outcomes'->>'conversations_total')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'avg_ai_confidence')::decimal, 0) * 
                    COALESCE((metric_data->'conversation_outcomes'->>'conversations_total')::integer, 0)
                ), 0),
                COUNT(CASE WHEN 
                    COALESCE((metric_data->'conversation_outcomes_metrics'->>'successful_outcomes')::integer, 0) > 0 
                    THEN 1 END)
                
            INTO v_total_tenants, v_active_tenants, v_platform_mrr, v_total_revenue,
                 v_total_appointments, v_total_customers, v_total_ai_interactions, v_total_conversations,
                 v_total_platform_costs, v_total_platform_margin, v_profitable_tenants,
                 v_weighted_success_rate, v_weighted_conversion_rate, v_weighted_satisfaction,
                 v_weighted_health_score, v_weighted_margin_pct, v_total_appointments_for_weights,
                 v_total_ai_cost_usd, v_total_ai_tokens, v_ai_cost_efficiency_avg, v_tenants_with_ai_costs,
                 v_total_successful_outcomes, v_total_business_outcomes, v_weighted_satisfaction_score, 
                 v_weighted_ai_confidence, v_total_conversations_with_outcomes
            FROM tenant_metrics 
            WHERE period = v_period
            AND metric_type = 'comprehensive'
            AND DATE(created_at) = p_calculation_date;
            
            RAISE NOTICE 'Aggregated % period: % tenants, MRR=%, Revenue=%, Appointments=%', 
                v_period, v_total_tenants, v_platform_mrr, v_total_revenue, v_total_appointments;
            
            -- Calculate weighted averages (avoid division by zero)
            IF v_total_appointments_for_weights > 0 THEN
                v_weighted_success_rate := v_weighted_success_rate / v_total_appointments_for_weights;
                v_weighted_conversion_rate := v_weighted_conversion_rate / v_total_appointments_for_weights;
                v_weighted_satisfaction := v_weighted_satisfaction / v_total_appointments_for_weights;
                v_weighted_health_score := v_weighted_health_score / v_total_appointments_for_weights;
                v_weighted_margin_pct := v_weighted_margin_pct / v_total_appointments_for_weights;
            END IF;
            
            -- =====================================================
            -- INSERT OR UPDATE PLATFORM_METRICS
            -- =====================================================
            
            INSERT INTO platform_metrics (
                calculation_date,
                period,
                platform_mrr,
                total_tenants_processed,
                active_tenants,
                total_revenue,
                total_appointments,
                total_customers,
                total_ai_interactions,
                total_conversations,
                avg_appointment_success_rate,
                avg_conversion_rate,
                avg_customer_satisfaction_score,
                avg_health_score,
                total_platform_costs,
                total_platform_margin,
                avg_margin_percentage,
                profitable_tenants_count,
                data_source,
                aggregation_method
            ) VALUES (
                p_calculation_date,
                v_period,
                v_platform_mrr,
                v_total_tenants,
                v_active_tenants,
                v_total_revenue,
                v_total_appointments,
                v_total_customers,
                v_total_ai_interactions,
                v_total_conversations,
                v_weighted_success_rate::DECIMAL(5,2),
                v_weighted_conversion_rate::DECIMAL(5,2),
                v_weighted_satisfaction::DECIMAL(3,1),
                ROUND(v_weighted_health_score)::INTEGER,
                v_total_platform_costs,
                v_total_platform_margin,
                v_weighted_margin_pct::DECIMAL(5,2),
                v_profitable_tenants,
                'tenant_metrics_aggregation_v1.0',
                'jsonb_single_pass_weighted_avg'
            )
            ON CONFLICT (calculation_date, period) 
            DO UPDATE SET
                platform_mrr = EXCLUDED.platform_mrr,
                total_tenants_processed = EXCLUDED.total_tenants_processed,
                active_tenants = EXCLUDED.active_tenants,
                total_revenue = EXCLUDED.total_revenue,
                total_appointments = EXCLUDED.total_appointments,
                total_customers = EXCLUDED.total_customers,
                total_ai_interactions = EXCLUDED.total_ai_interactions,
                total_conversations = EXCLUDED.total_conversations,
                avg_appointment_success_rate = EXCLUDED.avg_appointment_success_rate,
                avg_conversion_rate = EXCLUDED.avg_conversion_rate,
                avg_customer_satisfaction_score = EXCLUDED.avg_customer_satisfaction_score,
                avg_health_score = EXCLUDED.avg_health_score,
                total_platform_costs = EXCLUDED.total_platform_costs,
                total_platform_margin = EXCLUDED.total_platform_margin,
                avg_margin_percentage = EXCLUDED.avg_margin_percentage,
                profitable_tenants_count = EXCLUDED.profitable_tenants_count,
                data_source = EXCLUDED.data_source,
                aggregation_method = EXCLUDED.aggregation_method,
                updated_at = NOW();
            
            v_processed_periods := v_processed_periods || v_period;
            v_total_aggregations := v_total_aggregations + 1;
            
            RAISE NOTICE 'Successfully aggregated and stored platform metrics for period %', v_period;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error processing period %: %', v_period, SQLERRM;
        END;
    END LOOP;
    
    v_result := json_build_object(
        'success', true,
        'calculation_date', p_calculation_date,
        'periods_processed', v_processed_periods,
        'total_aggregations', v_total_aggregations,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start),
        'version', 'platform_metrics_aggregation_v1.0',
        'methodology', 'COLEAM00',
        'data_source', 'tenant_metrics',
        'aggregation_logic', 'platform_mrr = SUM(platform_subscription_cost)'
    );
    
    RAISE NOTICE 'Platform metrics aggregation completed: % periods processed in %ms', 
        array_length(v_processed_periods, 1),
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CRITICAL ERROR in platform metrics aggregation: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'sqlstate', SQLSTATE,
        'calculation_date', p_calculation_date,
        'periods_attempted', COALESCE(p_specific_period, 'ALL'),
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_from_tenants(date, text) TO authenticated;

-- =====================================================
-- CONVENIENCE FUNCTIONS
-- =====================================================

-- Function to aggregate all periods for a specific date
CREATE OR REPLACE FUNCTION aggregate_platform_metrics_all_periods(
    p_calculation_date date DEFAULT CURRENT_DATE
) RETURNS json AS $$
BEGIN
    RETURN aggregate_platform_metrics_from_tenants(p_calculation_date, NULL);
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate specific period for today  
CREATE OR REPLACE FUNCTION aggregate_platform_metrics_today(
    p_period text DEFAULT '30d'
) RETURNS json AS $$
BEGIN
    RETURN aggregate_platform_metrics_from_tenants(CURRENT_DATE, p_period);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_all_periods(date) TO authenticated;
GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_today(text) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Aggregate all periods for today
SELECT aggregate_platform_metrics_all_periods();

-- Aggregate specific period for today
SELECT aggregate_platform_metrics_today('30d');

-- Aggregate specific period for specific date
SELECT aggregate_platform_metrics_from_tenants('2025-08-10', '30d');

-- Check results
SELECT * FROM platform_metrics 
WHERE calculation_date = CURRENT_DATE 
ORDER BY period;
*/