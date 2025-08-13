-- ===================================================
-- IMPLEMENTAÇÃO 4 VARIÁVEIS CRÍTICAS - DEFINITIVA V5
-- Adicionar cálculos para: revenue_growth_rate, customer_lifetime_value, 
-- customer_retention_rate, customer_churn_rate
-- ===================================================

-- SEÇÃO 1: CÁLCULO DE REVENUE GROWTH RATE
-- Adicionar após os cálculos financeiros existentes (após linha ~476)

BEGIN
    -- Calculate revenue growth rate (period-over-period)
    DECLARE
        v_previous_period_revenue DECIMAL(15,2) := 0;
        v_current_period_revenue DECIMAL(15,2) := v_tenant_revenue;
        v_previous_start_date DATE := p_calculation_date - (v_period_days * 2 - 1);
        v_previous_end_date DATE := p_calculation_date - v_period_days;
    BEGIN
        -- Get previous period revenue for comparison
        SELECT COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0)
        INTO v_previous_period_revenue
        FROM appointments a 
        WHERE a.tenant_id = v_tenant_record.id
          AND a.created_at >= v_previous_start_date::timestamptz
          AND a.created_at < v_previous_end_date::timestamptz
          AND a.status IN ('completed', 'confirmed');
        
        -- Add subscription revenue for previous period
        SELECT v_previous_period_revenue + COALESCE(SUM(sp.amount), 0)
        INTO v_previous_period_revenue
        FROM subscription_payments sp
        WHERE sp.tenant_id = v_tenant_record.id
          AND sp.payment_date >= v_previous_start_date
          AND sp.payment_date < v_previous_end_date
          AND sp.status = 'completed';
        
        -- Calculate growth rate
        v_revenue_growth_rate := CASE 
            WHEN v_previous_period_revenue > 0 THEN
                ((v_current_period_revenue - v_previous_period_revenue) * 100.0 / v_previous_period_revenue)
            ELSE 0
        END;
        
        RAISE NOTICE 'Revenue growth calculated for %: current=%, previous=%, growth=%', 
            LEFT(v_tenant_record.id::text, 8), v_current_period_revenue, v_previous_period_revenue, v_revenue_growth_rate;
            
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Revenue growth calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
        v_revenue_growth_rate := 0;
    END;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Revenue growth rate calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
    v_revenue_growth_rate := 0;
END;

-- SEÇÃO 2: CÁLCULO DE CUSTOMER LIFETIME VALUE
-- Adicionar após cálculos de customer metrics (após linha ~499)

BEGIN
    -- Calculate Customer Lifetime Value
    DECLARE
        v_avg_order_value DECIMAL(10,2) := 0;
        v_purchase_frequency DECIMAL(8,2) := 0;
        v_customer_lifespan_months DECIMAL(8,2) := 12.0; -- Default 12 months
        v_active_customers INTEGER := 0;
        v_total_customer_revenue DECIMAL(15,2) := 0;
    BEGIN
        -- Get active customers and their metrics
        SELECT 
            COUNT(DISTINCT a.user_id),
            COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0),
            COALESCE(AVG(COALESCE(a.final_price, a.quoted_price, 0)), 0),
            COALESCE(COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT a.user_id), 0), 0)
        INTO v_active_customers, v_total_customer_revenue, v_avg_order_value, v_purchase_frequency
        FROM appointments a
        WHERE a.tenant_id = v_tenant_record.id
          AND a.created_at >= v_start_date::timestamptz
          AND a.created_at < (v_end_date + 1)::timestamptz
          AND a.status IN ('completed', 'confirmed')
          AND a.user_id IS NOT NULL;
        
        -- Estimate customer lifespan based on retention patterns
        -- If we have longer period data, calculate better lifespan estimate
        IF v_period_days >= 90 THEN
            DECLARE
                v_first_appointment_date DATE;
                v_last_appointment_date DATE;
                v_avg_customer_span_days INTEGER;
            BEGIN
                SELECT 
                    COALESCE(AVG(DATE_PART('days', last_apt - first_apt)), 90)
                INTO v_avg_customer_span_days
                FROM (
                    SELECT 
                        a.user_id,
                        MIN(a.created_at::date) as first_apt,
                        MAX(a.created_at::date) as last_apt
                    FROM appointments a
                    WHERE a.tenant_id = v_tenant_record.id
                      AND a.created_at >= (v_start_date - INTERVAL '6 months')::timestamptz
                      AND a.created_at < (v_end_date + 1)::timestamptz
                      AND a.user_id IS NOT NULL
                    GROUP BY a.user_id
                    HAVING COUNT(*) > 1
                ) customer_spans;
                
                v_customer_lifespan_months := GREATEST(3.0, v_avg_customer_span_days / 30.0);
            EXCEPTION WHEN OTHERS THEN
                v_customer_lifespan_months := 12.0;
            END;
        END IF;
        
        -- Calculate CLV: AOV × Purchase Frequency × Customer Lifespan (in months)
        -- Normalize frequency to monthly basis
        v_purchase_frequency := v_purchase_frequency * (30.0 / v_period_days);
        
        v_customer_lifetime_value := v_avg_order_value * v_purchase_frequency * v_customer_lifespan_months;
        
        RAISE NOTICE 'CLV calculated for %: AOV=%, freq=%, lifespan=% months, CLV=%', 
            LEFT(v_tenant_record.id::text, 8), v_avg_order_value, v_purchase_frequency, v_customer_lifespan_months, v_customer_lifetime_value;
            
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Customer lifetime value calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
        v_customer_lifetime_value := 0;
    END;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CLV calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
    v_customer_lifetime_value := 0;
END;

-- SEÇÃO 3: CÁLCULO DE CUSTOMER RETENTION RATE
-- Adicionar junto com cálculos de customer metrics

BEGIN
    -- Calculate Customer Retention Rate
    DECLARE
        v_customers_at_start INTEGER := 0;
        v_customers_at_end INTEGER := 0;
        v_new_customers_in_period INTEGER := 0;
        v_retained_customers INTEGER := 0;
        v_period_start_cutoff DATE := v_start_date - INTERVAL '30 days';
    BEGIN
        -- Customers at start of period (had activity before period start)
        SELECT COUNT(DISTINCT ut.user_id)
        INTO v_customers_at_start
        FROM user_tenants ut
        JOIN appointments a ON a.user_id = ut.user_id AND a.tenant_id = ut.tenant_id
        WHERE ut.tenant_id = v_tenant_record.id
          AND a.created_at < v_start_date::timestamptz
          AND a.created_at >= v_period_start_cutoff::timestamptz;
        
        -- Customers at end of period (have activity in current period)
        SELECT COUNT(DISTINCT ut.user_id)
        INTO v_customers_at_end
        FROM user_tenants ut
        JOIN appointments a ON a.user_id = ut.user_id AND a.tenant_id = ut.tenant_id
        WHERE ut.tenant_id = v_tenant_record.id
          AND a.created_at >= v_start_date::timestamptz
          AND a.created_at < (v_end_date + 1)::timestamptz;
        
        -- New customers in current period (first appointment in current period)
        SELECT COUNT(DISTINCT subq.user_id)
        INTO v_new_customers_in_period
        FROM (
            SELECT DISTINCT a.user_id, MIN(a.created_at) as first_appointment
            FROM appointments a
            WHERE a.tenant_id = v_tenant_record.id
              AND a.user_id IS NOT NULL
            GROUP BY a.user_id
            HAVING MIN(a.created_at) >= v_start_date::timestamptz
              AND MIN(a.created_at) < (v_end_date + 1)::timestamptz
        ) subq;
        
        -- Calculate retention rate: (Customers at end - New customers) / Customers at start * 100
        v_customer_retention_rate := CASE 
            WHEN v_customers_at_start > 0 THEN
                ((v_customers_at_end - v_new_customers_in_period) * 100.0 / v_customers_at_start)
            ELSE 0
        END;
        
        -- Ensure retention rate is within reasonable bounds (0-100%)
        v_customer_retention_rate := GREATEST(0, LEAST(100, v_customer_retention_rate));
        
        RAISE NOTICE 'Retention calculated for %: start=%, end=%, new=%, retention=%', 
            LEFT(v_tenant_record.id::text, 8), v_customers_at_start, v_customers_at_end, v_new_customers_in_period, v_customer_retention_rate;
            
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Customer retention calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
        v_customer_retention_rate := 0;
    END;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Customer retention rate calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
    v_customer_retention_rate := 0;
END;

-- SEÇÃO 4: CÁLCULO DE CUSTOMER CHURN RATE
-- Churn rate é complementar ao retention rate

BEGIN
    -- Calculate Customer Churn Rate (complement of retention rate)
    v_customer_churn_rate := 100.0 - v_customer_retention_rate;
    
    -- Alternative direct calculation method for verification
    DECLARE
        v_churned_customers INTEGER := 0;
        v_total_customers_beginning INTEGER := 0;
    BEGIN
        -- Customers who were active before period but not in current period
        SELECT COUNT(DISTINCT prev_customers.user_id)
        INTO v_churned_customers
        FROM (
            SELECT DISTINCT a.user_id
            FROM appointments a
            WHERE a.tenant_id = v_tenant_record.id
              AND a.created_at < v_start_date::timestamptz
              AND a.created_at >= (v_start_date - INTERVAL '60 days')::timestamptz
              AND a.user_id IS NOT NULL
        ) prev_customers
        LEFT JOIN (
            SELECT DISTINCT a.user_id
            FROM appointments a
            WHERE a.tenant_id = v_tenant_record.id
              AND a.created_at >= v_start_date::timestamptz
              AND a.created_at < (v_end_date + 1)::timestamptz
              AND a.user_id IS NOT NULL
        ) current_customers ON prev_customers.user_id = current_customers.user_id
        WHERE current_customers.user_id IS NULL;
        
        -- Total customers at beginning for churn calculation
        SELECT COUNT(DISTINCT a.user_id)
        INTO v_total_customers_beginning
        FROM appointments a
        WHERE a.tenant_id = v_tenant_record.id
          AND a.created_at < v_start_date::timestamptz
          AND a.created_at >= (v_start_date - INTERVAL '60 days')::timestamptz
          AND a.user_id IS NOT NULL;
        
        -- Use direct churn calculation if more accurate
        IF v_total_customers_beginning > 0 THEN
            DECLARE v_direct_churn_rate DECIMAL(5,2);
            BEGIN
                v_direct_churn_rate := (v_churned_customers * 100.0 / v_total_customers_beginning);
                
                -- Use the more conservative (lower) churn rate
                v_customer_churn_rate := LEAST(v_customer_churn_rate, v_direct_churn_rate);
            END;
        END IF;
        
        RAISE NOTICE 'Churn calculated for %: churned=%, total_beginning=%, churn_rate=%', 
            LEFT(v_tenant_record.id::text, 8), v_churned_customers, v_total_customers_beginning, v_customer_churn_rate;
            
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Direct churn calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
        -- Keep the complement calculation as fallback
    END;
    
    -- Ensure churn rate is within bounds (0-100%)
    v_customer_churn_rate := GREATEST(0, LEAST(100, v_customer_churn_rate));
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Customer churn rate calculation failed for % %d period: %', v_tenant_record.id, v_period_days, SQLERRM;
    v_customer_churn_rate := 0;
END;

-- SEÇÃO 5: ATUALIZAÇÃO DO JSONB COMPREHENSIVE_METRICS
-- Adicionar nas seções correspondentes do JSONB final:

/*
LOCALIZAR A SEÇÃO financial_metrics NO JSONB E ADICIONAR:

    'revenue_growth_rate', v_revenue_growth_rate,
    'customer_lifetime_value', v_customer_lifetime_value,

LOCALIZAR A SEÇÃO customer_metrics NO JSONB E ADICIONAR:

    'customer_retention_rate', v_customer_retention_rate,
    'customer_churn_rate', v_customer_churn_rate,
*/

-- ===================================================
-- INSTRUÇÕES DE IMPLEMENTAÇÃO
-- ===================================================

/*
PARA IMPLEMENTAR NA DEFINITIVA V5:

1. ENCONTRAR as seções de cálculo correspondentes na procedure existente
2. INSERIR cada seção no local apropriado:
   - Revenue Growth: Após cálculos financiais (~linha 476)
   - Customer CLV: Após customer metrics (~linha 499)
   - Retention/Churn: Junto com customer calculations
3. ATUALIZAR o JSONB comprehensive_metrics para incluir as 4 novas variáveis
4. TESTAR com um tenant antes de deploy geral

VERIFICAÇÕES:
✅ Todas usam schema existente
✅ Cálculos são period-aware 
✅ Exception handling implementado
✅ Logging detalhado para debug
✅ Bounds checking (0-100% para percentuais)
✅ Compatível com períodos 7d/30d/90d
*/

RAISE NOTICE '🚀 4 Critical Variables Implementation Ready!';
RAISE NOTICE '📊 Variables: revenue_growth_rate, customer_lifetime_value, customer_retention_rate, customer_churn_rate';
RAISE NOTICE '✅ Uses existing schema only - no table changes needed';
RAISE NOTICE '🎯 Ready for integration into DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql';
RAISE NOTICE '⚡ Includes comprehensive error handling and logging';