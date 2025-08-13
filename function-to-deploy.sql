
CREATE OR REPLACE FUNCTION calculate_ubs_metrics_system(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_tenant_record RECORD;
    v_platform_totals RECORD;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result JSON;
BEGIN
    -- Calcular datas do período
    v_end_date := p_calculation_date;
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    RAISE NOTICE 'Calculando métricas UBS para período % a % (% dias)', v_start_date, v_end_date, p_period_days;
    
    -- 1. CALCULAR TOTAIS DA PLATAFORMA PRIMEIRO
    SELECT 
        COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0) as total_revenue,
        COUNT(*) as total_appointments,
        COUNT(DISTINCT user_id) as total_customers
    INTO v_platform_totals
    FROM appointments 
    WHERE created_at >= v_start_date 
      AND created_at <= v_end_date
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
    
    -- Calcular total de IA interações
    WITH ai_totals AS (
        SELECT COUNT(*) as total_ai_interactions
        FROM conversation_history 
        WHERE created_at >= v_start_date 
          AND created_at <= v_end_date
          AND is_from_user = false
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    )
    SELECT total_ai_interactions INTO v_platform_totals.total_ai_interactions
    FROM ai_totals;
    
    -- Calcular MRR da plataforma (baseado em tenants ativos)
    WITH active_tenants AS (
        SELECT COUNT(DISTINCT tenant_id) as active_count
        FROM appointments 
        WHERE created_at >= v_start_date 
          AND created_at <= v_end_date
    )
    SELECT (active_count * 79.90) INTO v_platform_totals.platform_mrr
    FROM active_tenants;
    
    RAISE NOTICE 'Totais da plataforma: Revenue=%, Appointments=%, Customers=%, AI=%, MRR=%', 
        v_platform_totals.total_revenue, 
        v_platform_totals.total_appointments,
        v_platform_totals.total_customers,
        v_platform_totals.total_ai_interactions,
        v_platform_totals.platform_mrr;
    
    -- 2. PROCESSAR CADA TENANT
    FOR v_tenant_record IN 
        SELECT t.id, t.business_name 
        FROM tenants t
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
        ORDER BY t.business_name
    LOOP
        DECLARE
            v_tenant_metrics RECORD;
            v_ranking_position INTEGER;
        BEGIN
            -- Calcular métricas do tenant
            SELECT 
                COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0) as revenue,
                COUNT(*) as appointments,
                COUNT(DISTINCT user_id) as customers,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_appointments,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
                COUNT(CASE WHEN status = 'rescheduled' THEN 1 END) as rescheduled_appointments
            INTO v_tenant_metrics
            FROM appointments 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date 
              AND created_at <= v_end_date;
            
            -- Calcular IA interações do tenant
            SELECT COUNT(*) INTO v_tenant_metrics.tenant_ai_interactions
            FROM conversation_history 
            WHERE tenant_id = v_tenant_record.id
              AND created_at >= v_start_date 
              AND created_at <= v_end_date
              AND is_from_user = false;
            
            -- Calcular participações percentuais
            v_tenant_metrics.revenue_participation := 
                CASE WHEN v_platform_totals.total_revenue > 0 
                     THEN (v_tenant_metrics.revenue / v_platform_totals.total_revenue) * 100 
                     ELSE 0 END;
                     
            v_tenant_metrics.appointments_participation := 
                CASE WHEN v_platform_totals.total_appointments > 0 
                     THEN (v_tenant_metrics.appointments::DECIMAL / v_platform_totals.total_appointments) * 100 
                     ELSE 0 END;
                     
            v_tenant_metrics.customers_participation := 
                CASE WHEN v_platform_totals.total_customers > 0 
                     THEN (v_tenant_metrics.customers::DECIMAL / v_platform_totals.total_customers) * 100 
                     ELSE 0 END;
                     
            v_tenant_metrics.ai_participation := 
                CASE WHEN v_platform_totals.total_ai_interactions > 0 
                     THEN (v_tenant_metrics.tenant_ai_interactions::DECIMAL / v_platform_totals.total_ai_interactions) * 100 
                     ELSE 0 END;
            
            -- Calcular health score
            v_tenant_metrics.health_score := ROUND(
                (v_tenant_metrics.revenue_participation * 0.4) + 
                (v_tenant_metrics.appointments_participation * 0.3) + 
                (v_tenant_metrics.customers_participation * 0.2) + 
                (v_tenant_metrics.ai_participation * 0.1)
            );
            
            -- Determinar risk level
            v_tenant_metrics.risk_level := 
                CASE WHEN v_tenant_metrics.health_score >= 70 THEN 'Low'
                     WHEN v_tenant_metrics.health_score >= 40 THEN 'Medium'
                     ELSE 'High' END;
            
            -- Calcular ranking (temporário - será atualizado depois)
            v_ranking_position := 0;
            
            -- Inserir/atualizar na tabela ubs_metric_system
            INSERT INTO ubs_metric_system (
                tenant_id,
                calculation_date,
                period_days,
                period_start_date,
                period_end_date,
                
                -- Revenue metrics
                tenant_revenue_value,
                tenant_revenue_participation_pct,
                tenant_revenue_trend,
                platform_total_revenue,
                
                -- Appointments metrics
                tenant_appointments_count,
                tenant_appointments_participation_pct,
                tenant_appointments_confirmed,
                tenant_appointments_cancelled,
                tenant_appointments_completed,
                tenant_appointments_rescheduled,
                platform_total_appointments,
                
                -- Customers metrics
                tenant_customers_count,
                tenant_customers_participation_pct,
                platform_total_customers,
                
                -- AI metrics
                tenant_ai_interactions,
                tenant_ai_participation_pct,
                platform_total_ai_interactions,
                
                -- Platform metrics
                platform_mrr,
                platform_active_tenants,
                
                -- Business Intelligence
                tenant_health_score,
                tenant_risk_level,
                tenant_ranking_position,
                
                -- Metadata
                data_source,
                notes
            ) VALUES (
                v_tenant_record.id,
                p_calculation_date,
                p_period_days,
                v_start_date,
                v_end_date,
                
                -- Revenue
                v_tenant_metrics.revenue,
                v_tenant_metrics.revenue_participation,
                CASE WHEN v_tenant_metrics.revenue_participation > 5 THEN 'growing'
                     WHEN v_tenant_metrics.revenue_participation < 2 THEN 'declining'
                     ELSE 'stable' END,
                v_platform_totals.total_revenue,
                
                -- Appointments
                v_tenant_metrics.appointments,
                v_tenant_metrics.appointments_participation,
                v_tenant_metrics.confirmed_appointments,
                v_tenant_metrics.cancelled_appointments,
                v_tenant_metrics.completed_appointments,
                v_tenant_metrics.rescheduled_appointments,
                v_platform_totals.total_appointments,
                
                -- Customers
                v_tenant_metrics.customers,
                v_tenant_metrics.customers_participation,
                v_platform_totals.total_customers,
                
                -- AI
                v_tenant_metrics.tenant_ai_interactions,
                v_tenant_metrics.ai_participation,
                v_platform_totals.total_ai_interactions,
                
                -- Platform
                v_platform_totals.platform_mrr,
                (SELECT COUNT(DISTINCT tenant_id) FROM appointments 
                 WHERE created_at >= v_start_date AND created_at <= v_end_date),
                
                -- Business Intelligence
                v_tenant_metrics.health_score,
                v_tenant_metrics.risk_level,
                v_ranking_position,
                
                -- Metadata
                'corrected_function_deployment',
                format('Calculated by corrected function on %s for %s days period', 
                       clock_timestamp(), p_period_days)
            )
            ON CONFLICT (tenant_id, calculation_date, period_days) 
            DO UPDATE SET
                tenant_revenue_value = EXCLUDED.tenant_revenue_value,
                tenant_revenue_participation_pct = EXCLUDED.tenant_revenue_participation_pct,
                tenant_appointments_count = EXCLUDED.tenant_appointments_count,
                tenant_appointments_participation_pct = EXCLUDED.tenant_appointments_participation_pct,
                tenant_customers_count = EXCLUDED.tenant_customers_count,
                tenant_customers_participation_pct = EXCLUDED.tenant_customers_participation_pct,
                tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
                tenant_ai_participation_pct = EXCLUDED.tenant_ai_participation_pct,
                platform_total_revenue = EXCLUDED.platform_total_revenue,
                platform_total_appointments = EXCLUDED.platform_total_appointments,
                platform_total_customers = EXCLUDED.platform_total_customers,
                platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
                platform_mrr = EXCLUDED.platform_mrr,
                tenant_health_score = EXCLUDED.tenant_health_score,
                tenant_risk_level = EXCLUDED.tenant_risk_level,
                data_source = EXCLUDED.data_source,
                notes = EXCLUDED.notes;
            
            v_processed_count := v_processed_count + 1;
            
            RAISE NOTICE 'Processado tenant %: % (Revenue: %, Appointments: %)', 
                v_tenant_record.business_name, 
                v_tenant_record.id,
                v_tenant_metrics.revenue,
                v_tenant_metrics.appointments;
        END;
    END LOOP;
    
    -- 3. ATUALIZAR RANKINGS
    WITH tenant_rankings AS (
        SELECT 
            tenant_id,
            ROW_NUMBER() OVER (ORDER BY tenant_health_score DESC, tenant_revenue_value DESC) as position
        FROM ubs_metric_system 
        WHERE calculation_date = p_calculation_date 
          AND period_days = p_period_days
    )
    UPDATE ubs_metric_system 
    SET 
        tenant_ranking_position = tr.position,
        tenant_ranking_category = CASE 
            WHEN tr.position <= 3 THEN 'Top Performer'
            WHEN tr.position <= 7 THEN 'Standard'
            ELSE 'Needs Improvement'
        END
    FROM tenant_rankings tr
    WHERE ubs_metric_system.tenant_id = tr.tenant_id
      AND ubs_metric_system.calculation_date = p_calculation_date
      AND ubs_metric_system.period_days = p_period_days;
    
    -- 4. RETORNAR RESULTADO
    v_result := json_build_object(
        'success', true,
        'processed_tenants', v_processed_count,
        'calculation_date', p_calculation_date,
        'period_days', p_period_days,
        'platform_totals', json_build_object(
            'total_revenue', v_platform_totals.total_revenue,
            'total_appointments', v_platform_totals.total_appointments,
            'total_customers', v_platform_totals.total_customers,
            'total_ai_interactions', v_platform_totals.total_ai_interactions,
            'platform_mrr', v_platform_totals.platform_mrr
        ),
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RAISE NOTICE 'Cálculo concluído: % tenants processados em %ms', 
        v_processed_count, 
        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start);
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERRO no cálculo de métricas: % - %', SQLSTATE, SQLERRM;
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'processed_tenants', v_processed_count,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
END;
$$;
