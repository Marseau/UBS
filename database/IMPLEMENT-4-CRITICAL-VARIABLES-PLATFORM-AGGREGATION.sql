-- ===================================================
-- IMPLEMENTAÇÃO 4 VARIÁVEIS CRÍTICAS - PLATFORM AGGREGATION
-- Adicionar agregação para: revenue_growth_rate, customer_lifetime_value, 
-- customer_retention_rate, customer_churn_rate na procedure de platform_metrics
-- ===================================================

-- SEÇÃO 1: AGREGAÇÃO DE REVENUE GROWTH RATE
-- Adicionar na seção de cálculos financeiros da platform aggregation

DECLARE
    v_platform_revenue_growth_rate DECIMAL(5,2) := 0;
    v_total_tenants_with_growth INTEGER := 0;
    v_weighted_growth_sum DECIMAL(12,2) := 0;
BEGIN
    -- Calculate platform-wide revenue growth rate (weighted average by tenant revenue)
    SELECT 
        COALESCE(AVG(
            CASE WHEN (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL IS NOT NULL 
                 THEN (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL 
                 ELSE 0 END
        ), 0),
        COUNT(CASE WHEN (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL IS NOT NULL 
                   THEN 1 END),
        COALESCE(SUM(
            (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL * 
            (tm.comprehensive_metrics->'financial_metrics'->>'tenant_revenue')::DECIMAL
        ), 0)
    INTO v_platform_revenue_growth_rate, v_total_tenants_with_growth, v_weighted_growth_sum
    FROM tenant_metrics tm
    WHERE tm.calculation_date = p_calculation_date
      AND tm.period_days = p_period_days_param
      AND tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate' IS NOT NULL;
    
    -- Use weighted average if we have revenue data, otherwise simple average
    IF v_weighted_growth_sum > 0 AND EXISTS(
        SELECT 1 FROM tenant_metrics tm 
        WHERE tm.calculation_date = p_calculation_date 
        AND tm.period_days = p_period_days_param
        AND (tm.comprehensive_metrics->'financial_metrics'->>'tenant_revenue')::DECIMAL > 0
    ) THEN
        SELECT COALESCE(
            SUM((tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL * 
                (tm.comprehensive_metrics->'financial_metrics'->>'tenant_revenue')::DECIMAL) / 
            NULLIF(SUM((tm.comprehensive_metrics->'financial_metrics'->>'tenant_revenue')::DECIMAL), 0),
            0
        )
        INTO v_platform_revenue_growth_rate
        FROM tenant_metrics tm
        WHERE tm.calculation_date = p_calculation_date
          AND tm.period_days = p_period_days_param
          AND (tm.comprehensive_metrics->'financial_metrics'->>'tenant_revenue')::DECIMAL > 0;
    END IF;
    
    RAISE NOTICE 'Platform revenue growth rate calculated: % (from % tenants)', 
        v_platform_revenue_growth_rate, v_total_tenants_with_growth;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Platform revenue growth calculation failed: %', SQLERRM;
    v_platform_revenue_growth_rate := 0;
END;

-- SEÇÃO 2: AGREGAÇÃO DE CUSTOMER LIFETIME VALUE  
-- Adicionar na seção de customer metrics

DECLARE
    v_platform_avg_clv DECIMAL(10,2) := 0;
    v_platform_median_clv DECIMAL(10,2) := 0;
    v_total_tenants_with_clv INTEGER := 0;
BEGIN
    -- Calculate platform average and median CLV
    SELECT 
        COALESCE(AVG(
            (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL
        ), 0),
        COUNT(CASE WHEN (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL > 0 
                   THEN 1 END)
    INTO v_platform_avg_clv, v_total_tenants_with_clv
    FROM tenant_metrics tm
    WHERE tm.calculation_date = p_calculation_date
      AND tm.period_days = p_period_days_param
      AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL IS NOT NULL;
    
    -- Calculate median CLV for better central tendency
    SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY 
        (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL
    ), 0)
    INTO v_platform_median_clv
    FROM tenant_metrics tm
    WHERE tm.calculation_date = p_calculation_date
      AND tm.period_days = p_period_days_param
      AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL > 0;
    
    RAISE NOTICE 'Platform CLV calculated: avg=%, median=% (from % tenants)', 
        v_platform_avg_clv, v_platform_median_clv, v_total_tenants_with_clv;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Platform CLV calculation failed: %', SQLERRM;
    v_platform_avg_clv := 0;
    v_platform_median_clv := 0;
END;

-- SEÇÃO 3: AGREGAÇÃO DE CUSTOMER RETENTION RATE
-- Weighted average by customer count

DECLARE
    v_platform_retention_rate DECIMAL(5,2) := 0;
    v_total_customers_for_retention INTEGER := 0;
    v_retention_weighted_sum DECIMAL(12,2) := 0;
BEGIN
    -- Calculate platform retention rate weighted by customer count
    SELECT 
        COALESCE(SUM(
            (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL * 
            (tm.comprehensive_metrics->'customer_metrics'->>'tenant_customers')::INTEGER
        ), 0),
        COALESCE(SUM(
            (tm.comprehensive_metrics->'customer_metrics'->>'tenant_customers')::INTEGER
        ), 0)
    INTO v_retention_weighted_sum, v_total_customers_for_retention
    FROM tenant_metrics tm
    WHERE tm.calculation_date = p_calculation_date
      AND tm.period_days = p_period_days_param
      AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL IS NOT NULL
      AND (tm.comprehensive_metrics->'customer_metrics'->>'tenant_customers')::INTEGER > 0;
    
    -- Calculate weighted average retention rate
    v_platform_retention_rate := CASE 
        WHEN v_total_customers_for_retention > 0 THEN
            v_retention_weighted_sum / v_total_customers_for_retention
        ELSE 0
    END;
    
    RAISE NOTICE 'Platform retention rate calculated: % (weighted by % customers)', 
        v_platform_retention_rate, v_total_customers_for_retention;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Platform retention calculation failed: %', SQLERRM;
    v_platform_retention_rate := 0;
END;

-- SEÇÃO 4: AGREGAÇÃO DE CUSTOMER CHURN RATE
-- Similar to retention but could also be calculated independently

DECLARE
    v_platform_churn_rate DECIMAL(5,2) := 0;
    v_total_customers_for_churn INTEGER := 0;
    v_churn_weighted_sum DECIMAL(12,2) := 0;
BEGIN
    -- Calculate platform churn rate weighted by customer count
    SELECT 
        COALESCE(SUM(
            (tm.comprehensive_metrics->'customer_metrics'->>'customer_churn_rate')::DECIMAL * 
            (tm.comprehensive_metrics->'customer_metrics'->>'tenant_customers')::INTEGER
        ), 0),
        COALESCE(SUM(
            (tm.comprehensive_metrics->'customer_metrics'->>'tenant_customers')::INTEGER
        ), 0)
    INTO v_churn_weighted_sum, v_total_customers_for_churn
    FROM tenant_metrics tm
    WHERE tm.calculation_date = p_calculation_date
      AND tm.period_days = p_period_days_param
      AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_churn_rate')::DECIMAL IS NOT NULL
      AND (tm.comprehensive_metrics->'customer_metrics'->>'tenant_customers')::INTEGER > 0;
    
    -- Calculate weighted average churn rate
    v_platform_churn_rate := CASE 
        WHEN v_total_customers_for_churn > 0 THEN
            v_churn_weighted_sum / v_total_customers_for_churn
        ELSE 0
    END;
    
    -- Verification: churn + retention should be close to 100%
    IF ABS((v_platform_churn_rate + v_platform_retention_rate) - 100.0) > 5.0 THEN
        RAISE WARNING 'Churn + Retention rates don''t sum to 100%: churn=%, retention=%', 
            v_platform_churn_rate, v_platform_retention_rate;
    END IF;
    
    RAISE NOTICE 'Platform churn rate calculated: % (weighted by % customers)', 
        v_platform_churn_rate, v_total_customers_for_churn;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Platform churn calculation failed: %', SQLERRM;
    v_platform_churn_rate := 0;
END;

-- SEÇÃO 5: DISTRIBUIÇÃO E BENCHMARKING
-- Adicionar métricas de distribuição para análise

DECLARE
    v_top_performers JSONB := '{}';
    v_distribution_metrics JSONB := '{}';
BEGIN
    -- Top performing tenants by each metric
    SELECT jsonb_build_object(
        'highest_growth_tenant', (
            SELECT jsonb_build_object(
                'tenant_id', tm.tenant_id,
                'business_name', t.business_name,
                'growth_rate', (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL
            )
            FROM tenant_metrics tm
            JOIN tenants t ON tm.tenant_id = t.id
            WHERE tm.calculation_date = p_calculation_date
              AND tm.period_days = p_period_days_param
              AND (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL IS NOT NULL
            ORDER BY (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL DESC
            LIMIT 1
        ),
        'highest_clv_tenant', (
            SELECT jsonb_build_object(
                'tenant_id', tm.tenant_id,
                'business_name', t.business_name,
                'clv', (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL
            )
            FROM tenant_metrics tm
            JOIN tenants t ON tm.tenant_id = t.id
            WHERE tm.calculation_date = p_calculation_date
              AND tm.period_days = p_period_days_param
              AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL IS NOT NULL
            ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL DESC
            LIMIT 1
        ),
        'highest_retention_tenant', (
            SELECT jsonb_build_object(
                'tenant_id', tm.tenant_id,
                'business_name', t.business_name,
                'retention_rate', (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL
            )
            FROM tenant_metrics tm
            JOIN tenants t ON tm.tenant_id = t.id
            WHERE tm.calculation_date = p_calculation_date
              AND tm.period_days = p_period_days_param
              AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL IS NOT NULL
            ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL DESC
            LIMIT 1
        )
    )
    INTO v_top_performers;
    
    -- Distribution percentiles for benchmarking
    SELECT jsonb_build_object(
        'revenue_growth_percentiles', (
            SELECT jsonb_build_object(
                'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL),
                'p50', PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL),
                'p75', PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL),
                'p90', PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL)
            )
            FROM tenant_metrics tm
            WHERE tm.calculation_date = p_calculation_date
              AND tm.period_days = p_period_days_param
              AND (tm.comprehensive_metrics->'financial_metrics'->>'revenue_growth_rate')::DECIMAL IS NOT NULL
        ),
        'clv_percentiles', (
            SELECT jsonb_build_object(
                'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL),
                'p50', PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL),
                'p75', PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL),
                'p90', PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL)
            )
            FROM tenant_metrics tm
            WHERE tm.calculation_date = p_calculation_date
              AND tm.period_days = p_period_days_param
              AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_lifetime_value')::DECIMAL IS NOT NULL
        ),
        'retention_percentiles', (
            SELECT jsonb_build_object(
                'p25', PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL),
                'p50', PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL),
                'p75', PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL),
                'p90', PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL)
            )
            FROM tenant_metrics tm
            WHERE tm.calculation_date = p_calculation_date
              AND tm.period_days = p_period_days_param
              AND (tm.comprehensive_metrics->'customer_metrics'->>'customer_retention_rate')::DECIMAL IS NOT NULL
        )
    )
    INTO v_distribution_metrics;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Top performers calculation failed: %', SQLERRM;
    v_top_performers := '{}';
    v_distribution_metrics := '{}';
END;

-- SEÇÃO 6: ATUALIZAÇÃO DO JSONB PLATFORM_METRICS
-- Adicionar no JSONB final da platform aggregation procedure:

/*
LOCALIZAR A SEÇÃO DO JSONB FINAL E ADICIONAR:

    -- Business Growth Metrics
    'platform_revenue_growth_rate', v_platform_revenue_growth_rate,
    'platform_avg_customer_lifetime_value', v_platform_avg_clv,
    'platform_median_customer_lifetime_value', v_platform_median_clv,
    'platform_customer_retention_rate', v_platform_retention_rate,
    'platform_customer_churn_rate', v_platform_churn_rate,
    
    -- Tenant Performance Distribution
    'top_performers', v_top_performers,
    'performance_distribution', v_distribution_metrics,
    
    -- Calculation Metadata
    'tenants_with_growth_data', v_total_tenants_with_growth,
    'tenants_with_clv_data', v_total_tenants_with_clv,
    'customers_analyzed_retention', v_total_customers_for_retention,
    'customers_analyzed_churn', v_total_customers_for_churn,
*/

-- ===================================================
-- INSTRUÇÕES DE IMPLEMENTAÇÃO
-- ===================================================

/*
PARA IMPLEMENTAR NA PLATFORM AGGREGATION PROCEDURE:

1. LOCALIZAR: database/platform-metrics-aggregation-procedure.sql
2. ENCONTRAR: aggregate_platform_metrics_from_tenants function
3. ADICIONAR: Cada seção no local apropriado da procedure
4. ATUALIZAR: O JSONB comprehensive_metrics da plataforma
5. TESTAR: Com dados reais antes do deploy

FEATURES INCLUÍDAS:
✅ Weighted averages por revenue/customers
✅ Median calculations para melhor representação
✅ Top performers identification
✅ Distribution percentiles para benchmarking
✅ Data quality metadata (quantos tenants têm cada métrica)
✅ Validation checks (churn + retention ≈ 100%)
✅ Comprehensive error handling

DEPENDÊNCIAS:
✅ Requer que DEFINITIVA v5 seja atualizada primeiro
✅ Usa JSONB paths dos tenant_metrics
✅ Compatível com current aggregation architecture
*/

RAISE NOTICE '🚀 4 Critical Variables Platform Aggregation Ready!';
RAISE NOTICE '📊 Platform Metrics: revenue_growth_rate, avg_clv, retention_rate, churn_rate';
RAISE NOTICE '🎯 Includes weighted averages and distribution analysis';
RAISE NOTICE '✅ Ready for integration into platform-metrics-aggregation-procedure.sql';
RAISE NOTICE '📈 Provides tenant benchmarking and performance insights';