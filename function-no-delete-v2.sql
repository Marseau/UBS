-- ================================================================================
-- FUNÇÃO SEM DELETE - VERSÃO 2 - PARA PRESERVAR DADOS E COMPARAR
-- ================================================================================
-- NÃO limpa dados existentes - permite comparar versões
-- Usa data_source único para identificar esta versão
-- ================================================================================

CREATE OR REPLACE FUNCTION calculate_ubs_metrics_v2(
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
    v_total_revenue DECIMAL;
    v_total_appointments INTEGER;
    v_total_customers INTEGER;
    v_total_ai_interactions INTEGER;
    v_platform_mrr DECIMAL;
    v_active_tenants_count INTEGER;
    v_processed_count INTEGER := 0;
    v_execution_start TIMESTAMP := clock_timestamp();
    v_result JSON;
    v_data_source TEXT := 'v2_no_delete_start_time';
BEGIN
    -- Calcular datas do período
    v_end_date := p_calculation_date;
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    
    -- NÃO LIMPAR DADOS - PRESERVAR PARA COMPARAÇÃO
    -- DELETE removido intencionalmente
    
    -- ================================================================================
    -- 1. CALCULAR TOTAIS DA PLATAFORMA - USANDO start_time
    -- ================================================================================
    SELECT 
        COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0),
        COUNT(*),
        COUNT(DISTINCT user_id)
    INTO v_total_revenue, v_total_appointments, v_total_customers
    FROM appointments 
    WHERE start_time::date >= v_start_date 
      AND start_time::date <= v_end_date;
    
    -- Calcular total de IA interações - usando created_at para conversations
    SELECT COUNT(*)
    INTO v_total_ai_interactions
    FROM conversation_history 
    WHERE created_at::date >= v_start_date 
      AND created_at::date <= v_end_date
      AND is_from_user = false;
    
    -- Calcular tenants ativos - baseado em start_time
    SELECT COUNT(DISTINCT tenant_id)
    INTO v_active_tenants_count
    FROM appointments 
    WHERE start_time::date >= v_start_date 
      AND start_time::date <= v_end_date;
      
    v_platform_mrr := v_active_tenants_count * 79.90;
    
    -- ================================================================================
    -- 2. PROCESSAR TENANTS
    -- ================================================================================
    FOR v_tenant_record IN 
        SELECT t.id, t.business_name 
        FROM tenants t
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
        ORDER BY t.business_name
    LOOP
        DECLARE
            v_tenant_revenue DECIMAL;
            v_tenant_appointments INTEGER;
            v_tenant_customers INTEGER;
            v_tenant_confirmed INTEGER;
            v_tenant_cancelled INTEGER;
            v_tenant_completed INTEGER;
            v_tenant_rescheduled INTEGER;
            v_tenant_ai_interactions INTEGER;
            v_revenue_participation DECIMAL;
            v_appointments_participation DECIMAL;
            v_customers_participation DECIMAL;
            v_ai_participation DECIMAL;
            v_health_score INTEGER;
            v_risk_level TEXT;
        BEGIN
            -- Calcular métricas do tenant - USANDO start_time
            SELECT 
                COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0),
                COUNT(*),
                COUNT(DISTINCT user_id),
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
                COUNT(CASE WHEN status = 'completed' THEN 1 END),
                COUNT(CASE WHEN status = 'rescheduled' THEN 1 END)
            INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers,
                 v_tenant_confirmed, v_tenant_cancelled, v_tenant_completed, v_tenant_rescheduled
            FROM appointments 
            WHERE tenant_id = v_tenant_record.id
              AND start_time::date >= v_start_date 
              AND start_time::date <= v_end_date;
            
            -- Calcular IA interações do tenant
            SELECT COUNT(*)
            INTO v_tenant_ai_interactions
            FROM conversation_history 
            WHERE tenant_id = v_tenant_record.id
              AND created_at::date >= v_start_date 
              AND created_at::date <= v_end_date
              AND is_from_user = false;
            
            -- Calcular participações percentuais
            v_revenue_participation := 
                CASE WHEN v_total_revenue > 0 
                     THEN (v_tenant_revenue / v_total_revenue) * 100 
                     ELSE 0 END;
                     
            v_appointments_participation := 
                CASE WHEN v_total_appointments > 0 
                     THEN (v_tenant_appointments::DECIMAL / v_total_appointments) * 100 
                     ELSE 0 END;
                     
            v_customers_participation := 
                CASE WHEN v_total_customers > 0 
                     THEN (v_tenant_customers::DECIMAL / v_total_customers) * 100 
                     ELSE 0 END;
                     
            v_ai_participation := 
                CASE WHEN v_total_ai_interactions > 0 
                     THEN (v_tenant_ai_interactions::DECIMAL / v_total_ai_interactions) * 100 
                     ELSE 0 END;
            
            -- Calcular health score
            v_health_score := ROUND(
                (v_revenue_participation * 0.4) + 
                (v_appointments_participation * 0.3) + 
                (v_customers_participation * 0.2) + 
                (v_ai_participation * 0.1)
            );
            
            -- Determinar risk level
            v_risk_level := 
                CASE WHEN v_health_score >= 70 THEN 'Low'
                     WHEN v_health_score >= 40 THEN 'Medium'
                     ELSE 'High' END;
            
            -- REMOVER REGISTRO ANTERIOR DESTA VERSÃO APENAS
            DELETE FROM ubs_metric_system 
            WHERE tenant_id = v_tenant_record.id
              AND calculation_date = p_calculation_date 
              AND period_days = p_period_days
              AND data_source = v_data_source;
            
            -- Inserir dados na tabela
            INSERT INTO ubs_metric_system (
                tenant_id, calculation_date, period_days, period_start_date, period_end_date,
                tenant_revenue_value, tenant_revenue_participation_pct, tenant_revenue_trend, platform_total_revenue,
                tenant_appointments_count, tenant_appointments_participation_pct, 
                tenant_appointments_confirmed, tenant_appointments_cancelled, 
                tenant_appointments_completed, tenant_appointments_rescheduled, platform_total_appointments,
                tenant_customers_count, tenant_customers_participation_pct, platform_total_customers,
                tenant_ai_interactions, tenant_ai_participation_pct, platform_total_ai_interactions,
                platform_mrr, platform_active_tenants,
                tenant_health_score, tenant_risk_level, tenant_ranking_position,
                data_source, notes
            ) VALUES (
                v_tenant_record.id, p_calculation_date, p_period_days, v_start_date, v_end_date,
                v_tenant_revenue, v_revenue_participation, 
                CASE WHEN v_revenue_participation > 5 THEN 'growing'
                     WHEN v_revenue_participation < 2 THEN 'declining'
                     ELSE 'stable' END, 
                v_total_revenue,
                v_tenant_appointments, v_appointments_participation,
                v_tenant_confirmed, v_tenant_cancelled, v_tenant_completed, v_tenant_rescheduled, v_total_appointments,
                v_tenant_customers, v_customers_participation, v_total_customers,
                v_tenant_ai_interactions, v_ai_participation, v_total_ai_interactions,
                v_platform_mrr, v_active_tenants_count,
                v_health_score, v_risk_level, 0,
                v_data_source,
                'V2: No global delete, using start_time for appointments'
            );
            
            v_processed_count := v_processed_count + 1;
        END;
    END LOOP;
    
    -- Retornar resultado
    v_result := json_build_object(
        'success', true,
        'version', 'v2_no_delete',
        'processed_tenants', v_processed_count,
        'calculation_date', p_calculation_date,
        'period_days', p_period_days,
        'platform_totals', json_build_object(
            'total_revenue', v_total_revenue,
            'total_appointments', v_total_appointments,
            'total_customers', v_total_customers,
            'total_ai_interactions', v_total_ai_interactions,
            'platform_mrr', v_platform_mrr,
            'active_tenants', v_active_tenants_count
        ),
        'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
    );
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'version', 'v2_no_delete',
        'error', SQLERRM,
        'processed_tenants', v_processed_count
    );
END;
$$;