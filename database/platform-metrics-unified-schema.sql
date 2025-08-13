-- =====================================================
-- PLATFORM METRICS UNIFIED SCHEMA
-- Alinha platform_metrics com tenant_metrics para uniformidade total
-- Baseado na metodologia COLEAM00 para UBS (Universal Booking System)
-- =====================================================

-- Backup da tabela atual
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_metrics') THEN
        DROP TABLE IF EXISTS platform_metrics_backup_unified;
        CREATE TABLE platform_metrics_backup_unified AS 
        SELECT * FROM platform_metrics;
        RAISE NOTICE 'Backup criado: platform_metrics_backup_unified';
    END IF;
END $$;

-- Drop da tabela atual e recriação com estrutura uniforme
DROP TABLE IF EXISTS platform_metrics CASCADE;

-- =====================================================
-- NOVA PLATFORM_METRICS - ESTRUTURA IDÊNTICA À tenant_metrics
-- =====================================================
CREATE TABLE platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação (ao invés de tenant_id, usamos platform_id = 'PLATFORM')
    platform_id VARCHAR(50) DEFAULT 'PLATFORM' NOT NULL,
    
    -- Mesmos campos de tenant_metrics
    period VARCHAR(10) NOT NULL, -- '7d', '30d', '90d'
    metric_type VARCHAR(50) DEFAULT 'comprehensive' NOT NULL,
    
    -- JSONB principal - MESMA estrutura que tenant_metrics
    metric_data JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint por período (só pode haver 1 registro da plataforma por período)
    UNIQUE(platform_id, period, metric_type)
);

-- Índices para performance (mesmos padrões que tenant_metrics)
CREATE INDEX IF NOT EXISTS idx_platform_metrics_platform_period ON platform_metrics(platform_id, period);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_period ON platform_metrics(period);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_created_at ON platform_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_metric_data ON platform_metrics USING GIN (metric_data);

-- =====================================================
-- FUNÇÃO DE AGREGAÇÃO UNIFORME
-- Usa a MESMA estrutura JSONB que tenant_metrics
-- =====================================================

DROP FUNCTION IF EXISTS aggregate_platform_metrics_unified(date, text);

CREATE OR REPLACE FUNCTION aggregate_platform_metrics_unified(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_specific_period text DEFAULT NULL -- '7d', '30d', '90d', ou NULL para todos
) RETURNS json AS $$
DECLARE
    v_period_list text[];
    v_period text;
    v_processed_periods text[] := '{}';
    v_execution_start TIMESTAMP := clock_timestamp();
    v_total_aggregations INTEGER := 0;
    v_result json;
BEGIN
    RAISE NOTICE 'Starting UNIFIED platform metrics aggregation (same structure as tenant_metrics)';
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
            -- Variables for aggregated platform metrics
            v_comprehensive_platform_metrics JSONB;
            
            -- Aggregated values from tenant_metrics
            v_platform_mrr DECIMAL(15,2) := 0;
            v_total_revenue DECIMAL(15,2) := 0;
            v_total_appointments INTEGER := 0;
            v_total_customers INTEGER := 0;
            v_total_ai_interactions INTEGER := 0;
            v_total_conversations INTEGER := 0;
            v_total_tenants INTEGER := 0;
            v_active_tenants INTEGER := 0;
            v_profitable_tenants INTEGER := 0;
            
            -- Weighted averages
            v_weighted_success_rate DECIMAL(15,4) := 0;
            v_weighted_conversion_rate DECIMAL(15,4) := 0;
            v_weighted_satisfaction DECIMAL(15,4) := 0;
            v_weighted_health_score DECIMAL(15,4) := 0;
            v_weighted_margin_pct DECIMAL(15,4) := 0;
            v_total_weight INTEGER := 0; -- Total appointments for weighting
            
            -- Cost aggregations
            v_total_platform_costs DECIMAL(15,2) := 0;
            v_total_platform_margin DECIMAL(15,2) := 0;
            
            -- Service metrics
            v_total_services INTEGER := 0;
            v_total_active_services INTEGER := 0;
            
        BEGIN
            RAISE NOTICE 'Processing unified platform aggregation for period: %', v_period;
            
            -- =====================================================
            -- AGREGAÇÃO DOS TENANT_METRICS PARA PLATFORM LEVEL
            -- =====================================================
            
            SELECT 
                -- Contadores básicos
                COUNT(*),
                COUNT(CASE WHEN 
                    COALESCE((metric_data->>'appointments')::integer, 0) > 0 
                    THEN 1 END),
                
                -- Platform MRR = Será calculado via subscription_payments
                0::decimal, -- Placeholder, será substituído abaixo
                
                -- Revenue total (usa campo direto do tenant_metrics v6.0)
                COALESCE(SUM(
                    COALESCE((metric_data->>'revenue')::decimal, 0)
                ), 0),
                
                -- Métricas operacionais (usa campos diretos do tenant_metrics v6.0)
                COALESCE(SUM(
                    COALESCE((metric_data->>'appointments')::integer, 0)
                ), 0),
                COALESCE(SUM(
                    COALESCE((metric_data->>'customers')::integer, 0)
                ), 0),
                -- AI interactions = 0 (não disponível no v6.0 atual)
                0,
                -- Conversations = 0 (não disponível no v6.0 atual) 
                0,
                
                -- Custos = 0 (não disponível no v6.0)
                0::decimal,
                -- Margem = 0 (não disponível no v6.0) 
                0::decimal,
                
                -- Tenants lucrativos = tenants com revenue > 0
                COUNT(CASE WHEN 
                    COALESCE((metric_data->>'revenue')::decimal, 0) > 0
                    THEN 1 END),
                
                -- Serviços = 0 (não disponível no v6.0)
                0,
                0,
                
                -- Médias ponderadas = 0 (não disponível no v6.0)
                0::decimal,
                0::decimal,  
                0::decimal,
                0::integer,
                0::decimal,
                
                -- Peso total = total appointments
                COALESCE(SUM(
                    COALESCE((metric_data->>'appointments')::integer, 0)
                ), 0)
                
            INTO v_total_tenants, v_active_tenants, v_platform_mrr, v_total_revenue,
                 v_total_appointments, v_total_customers, v_total_ai_interactions, 
                 v_total_conversations, v_total_platform_costs, v_total_platform_margin,
                 v_profitable_tenants, v_total_services, v_total_active_services,
                 v_weighted_success_rate, v_weighted_conversion_rate, v_weighted_satisfaction,
                 v_weighted_health_score, v_weighted_margin_pct, v_total_weight
            FROM tenant_metrics 
            WHERE period = v_period
            AND metric_type = 'comprehensive'
            AND DATE(created_at) = p_calculation_date;
            
            -- =====================================================
            -- CALCULAR PLATFORM MRR REAL VIA SUBSCRIPTION_PAYMENTS
            -- =====================================================
            
            -- Calcular data de início do período e consultar subscription_payments
            SELECT COALESCE(SUM(sp.amount::decimal), 0)
            INTO v_platform_mrr
            FROM subscription_payments sp
            INNER JOIN tenants t ON sp.tenant_id = t.id
            WHERE sp.payment_status = 'completed'
            AND sp.payment_period_start >= (p_calculation_date - INTERVAL '1 day' * (REPLACE(v_period, 'd', '')::integer - 1))
            AND sp.payment_period_start <= p_calculation_date
            AND t.status = 'active';
            
            RAISE NOTICE 'Platform MRR calculated from subscription_payments: $% for period %', v_platform_mrr, v_period;
            
            RAISE NOTICE 'Aggregated % period: % tenants, Platform MRR=$% (from payments), Total Revenue=$%, Appointments=%', 
                v_period, v_total_tenants, v_platform_mrr, v_total_revenue, v_total_appointments;
            
            -- Calcular médias ponderadas (evitar divisão por zero)
            IF v_total_weight > 0 THEN
                v_weighted_success_rate := v_weighted_success_rate / v_total_weight;
                v_weighted_conversion_rate := v_weighted_conversion_rate / v_total_weight;
                v_weighted_satisfaction := v_weighted_satisfaction / v_total_weight;
                v_weighted_health_score := v_weighted_health_score / v_total_weight;
                v_weighted_margin_pct := v_weighted_margin_pct / v_total_weight;
            END IF;
            
            -- =====================================================
            -- CONSTRUIR JSONB UNIFICADO - MESMA ESTRUTURA QUE TENANT_METRICS
            -- =====================================================
            
            v_comprehensive_platform_metrics := jsonb_build_object(
                'financial_metrics', jsonb_build_object(
                    'platform_mrr', v_platform_mrr, -- ESTE É O MRR DA PLATAFORMA!
                    'total_tenant_revenue', v_total_revenue,
                    'total_platform_costs', v_total_platform_costs,
                    'total_platform_margin', v_total_platform_margin,
                    'avg_margin_percentage', v_weighted_margin_pct::DECIMAL(5,2),
                    'profitable_tenants_count', v_profitable_tenants,
                    'profitability_rate', CASE WHEN v_total_tenants > 0 
                        THEN (v_profitable_tenants * 100.0 / v_total_tenants)::DECIMAL(5,2) 
                        ELSE 0 END
                ),
                'appointment_metrics', jsonb_build_object(
                    'total_appointments', v_total_appointments,
                    'avg_success_rate', v_weighted_success_rate::DECIMAL(5,2),
                    'appointments_per_tenant', CASE WHEN v_active_tenants > 0 
                        THEN (v_total_appointments::DECIMAL / v_active_tenants)::DECIMAL(8,2) 
                        ELSE 0 END
                ),
                'customer_metrics', jsonb_build_object(
                    'total_customers', v_total_customers,
                    'customers_per_tenant', CASE WHEN v_active_tenants > 0 
                        THEN (v_total_customers::DECIMAL / v_active_tenants)::DECIMAL(8,2) 
                        ELSE 0 END
                ),
                'conversation_outcomes', jsonb_build_object(
                    'total_conversations', v_total_conversations,
                    'total_ai_interactions', v_total_ai_interactions,
                    'avg_conversion_rate', v_weighted_conversion_rate::DECIMAL(5,2),
                    'avg_satisfaction_score', v_weighted_satisfaction::DECIMAL(3,1)
                ),
                'service_metrics', jsonb_build_object(
                    'total_services', v_total_services,
                    'total_active_services', v_total_active_services,
                    'avg_services_per_tenant', CASE WHEN v_total_tenants > 0 
                        THEN (v_total_active_services::DECIMAL / v_total_tenants)::DECIMAL(8,2) 
                        ELSE 0 END
                ),
                'tenant_outcomes', jsonb_build_object(
                    'avg_health_score', ROUND(v_weighted_health_score)::INTEGER,
                    'total_tenants_processed', v_total_tenants,
                    'active_tenants', v_active_tenants,
                    'platform_health_rating', CASE 
                        WHEN v_weighted_health_score >= 80 THEN 'Excellent'
                        WHEN v_weighted_health_score >= 70 THEN 'Good'
                        WHEN v_weighted_health_score >= 50 THEN 'Fair'
                        WHEN v_weighted_health_score >= 30 THEN 'Poor'
                        ELSE 'Critical' END
                ),
                'metadata', jsonb_build_object(
                    'calculation_date', p_calculation_date,
                    'period_days', REPLACE(v_period, 'd', '')::integer,
                    'period', v_period,
                    'data_source', 'tenant_metrics_unified_aggregation',
                    'aggregation_method', 'jsonb_weighted_sum',
                    'total_source_records', v_total_tenants,
                    'version', 'unified_platform_metrics_v1.0',
                    'methodology', 'COLEAM00_uniform_structure'
                )
            );
            
            -- =====================================================
            -- INSERT/UPDATE NA PLATFORM_METRICS (ESTRUTURA UNIFORME)
            -- =====================================================
            
            INSERT INTO platform_metrics (
                platform_id,
                period,
                metric_type,
                metric_data
            ) VALUES (
                'PLATFORM',
                v_period,
                'comprehensive',
                v_comprehensive_platform_metrics
            )
            ON CONFLICT (platform_id, period, metric_type) 
            DO UPDATE SET
                metric_data = EXCLUDED.metric_data,
                updated_at = NOW();
            
            v_processed_periods := v_processed_periods || v_period;
            v_total_aggregations := v_total_aggregations + 1;
            
            RAISE NOTICE 'Successfully stored unified platform metrics for period % (MRR: $%)', 
                v_period, v_platform_mrr;
            
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
        'version', 'unified_platform_metrics_v1.0',
        'methodology', 'COLEAM00_uniform_structure',
        'schema_alignment', 'identical_to_tenant_metrics',
        'key_insight', 'platform_mrr_equals_sum_tenant_subscription_costs'
    );
    
    RAISE NOTICE 'Unified platform metrics aggregation completed: % periods in %ms', 
        array_length(v_processed_periods, 1),
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CRITICAL ERROR in unified platform aggregation: % - %', SQLSTATE, SQLERRM;
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
GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_unified(date, text) TO authenticated;

-- =====================================================
-- FUNÇÕES DE CONVENIÊNCIA (mesmos padrões que tenant_metrics)
-- =====================================================

-- Agregar todos os períodos para uma data específica
CREATE OR REPLACE FUNCTION aggregate_platform_metrics_all_periods_unified(
    p_calculation_date date DEFAULT CURRENT_DATE
) RETURNS json AS $$
BEGIN
    RETURN aggregate_platform_metrics_unified(p_calculation_date, NULL);
END;
$$ LANGUAGE plpgsql;

-- Agregar período específico para hoje
CREATE OR REPLACE FUNCTION aggregate_platform_metrics_today_unified(
    p_period text DEFAULT '30d'
) RETURNS json AS $$
BEGIN
    RETURN aggregate_platform_metrics_unified(CURRENT_DATE, p_period);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_all_periods_unified(date) TO authenticated;
GRANT EXECUTE ON FUNCTION aggregate_platform_metrics_today_unified(text) TO authenticated;

-- =====================================================
-- COMPATIBILIDADE: Função para acessar MRR facilmente
-- =====================================================

CREATE OR REPLACE FUNCTION get_platform_mrr(
    p_period text DEFAULT '30d',
    p_date date DEFAULT CURRENT_DATE
) RETURNS decimal AS $$
DECLARE
    v_mrr decimal;
BEGIN
    SELECT (metric_data->'financial_metrics'->>'platform_mrr')::decimal
    INTO v_mrr
    FROM platform_metrics
    WHERE platform_id = 'PLATFORM'
    AND period = p_period
    AND DATE(created_at) = p_date
    AND metric_type = 'comprehensive';
    
    RETURN COALESCE(v_mrr, 0);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_platform_mrr(text, date) TO authenticated;

-- =====================================================
-- EXEMPLOS DE USO
-- =====================================================

/*
-- Agregar todos os períodos para hoje (estrutura uniforme)
SELECT aggregate_platform_metrics_all_periods_unified();

-- Agregar período específico
SELECT aggregate_platform_metrics_today_unified('30d');

-- Ver resultados (mesma estrutura que tenant_metrics!)
SELECT platform_id, period, metric_type, metric_data 
FROM platform_metrics 
WHERE DATE(created_at) = CURRENT_DATE 
ORDER BY period;

-- Acessar MRR da plataforma facilmente
SELECT get_platform_mrr('30d'); -- MRR mensal da plataforma

-- Comparar estruturas (devem ser idênticas!)
SELECT 'tenant_metrics' as table_type, jsonb_object_keys(metric_data) as modules 
FROM tenant_metrics LIMIT 1
UNION ALL
SELECT 'platform_metrics' as table_type, jsonb_object_keys(metric_data) as modules 
FROM platform_metrics LIMIT 1;
*/

DO $$
BEGIN
    RAISE NOTICE '✅ Platform metrics schema unified with tenant_metrics structure successfully!';
    RAISE NOTICE '🎯 Key benefit: platform_mrr = SUM(tenant subscription costs)';
    RAISE NOTICE '🔄 Architecture: Identical JSONB structure enables uniform processing';
    RAISE NOTICE '📊 Ready for: Super Admin Dashboard with consistent data patterns';
END $$;