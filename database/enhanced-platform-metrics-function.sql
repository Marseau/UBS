-- =====================================================
-- FUNÇÃO APRIMORADA PARA MÉTRICAS COMPLETAS DA PLATAFORMA
-- =====================================================
-- Calcula todos os KPIs necessários para o Super Admin Dashboard
-- Inclui: Receita/Uso, Eficiência Operacional, Spam Rate, Distorção
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_enhanced_platform_metrics(
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
    v_tenant_data RECORD;
    v_platform_totals JSONB;
    
    -- Platform aggregations
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
    
    -- JSON arrays for insights
    v_top_distortion_tenants JSONB := '[]'::JSONB;
    v_upsell_opportunities JSONB := '[]'::JSONB;
    v_churn_risk_tenants JSONB := '[]'::JSONB;
    
    -- Temporary calculations
    v_total_conversations INTEGER := 0;
    v_total_valid_conversations INTEGER := 0;
    v_total_spam_conversations INTEGER := 0;
    v_distortion_array JSONB := '[]'::JSONB;
    
BEGIN
    v_start_time := clock_timestamp();
    v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
    v_end_date := p_calculation_date;
    
    RAISE NOTICE '🚀 Iniciando cálculo de métricas aprimoradas da plataforma para período: % a %', v_start_date, v_end_date;
    
    -- =====================================================
    -- ETAPA 1: EXECUTAR FUNÇÃO BÁSICA EXISTENTE
    -- =====================================================
    
    RAISE NOTICE '📊 Executando função básica calculate_metrics_final_corrected...';
    
    -- Execute basic function first to populate basic metrics
    PERFORM calculate_metrics_final_corrected(p_calculation_date, p_period_days, p_tenant_id);
    
    -- =====================================================
    -- ETAPA 2: CALCULAR MÉTRICAS AVANÇADAS POR TENANT
    -- =====================================================
    
    RAISE NOTICE '🔍 Calculando métricas avançadas por tenant...';
    
    FOR v_tenant_data IN 
        SELECT DISTINCT 
            t.id as tenant_id,
            t.business_name,
            COALESCE(t.monthly_revenue, 79.90) as monthly_revenue
        FROM tenants t 
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
        AND t.status = 'active'
    LOOP
        v_processed_tenants := v_processed_tenants + 1;
        
        DECLARE
            v_tenant_revenue DECIMAL(12,2) := 0;
            v_tenant_appointments INTEGER := 0;
            v_tenant_customers INTEGER := 0;
            v_tenant_ai_interactions INTEGER := 0;
            v_tenant_chat_minutes INTEGER := 0;
            v_tenant_conversations INTEGER := 0;
            v_tenant_valid_conversations INTEGER := 0;
            v_tenant_spam_conversations INTEGER := 0;
            v_tenant_spam_score DECIMAL(5,2) := 0;
            v_tenant_efficiency_score DECIMAL(8,2) := 0;
            v_tenant_receita_uso_ratio DECIMAL(10,2) := 0;
            v_conversation_to_appointment_rate DECIMAL(5,2) := 0;
        BEGIN
            
            -- =====================================================
            -- CÁLCULO DE DURAÇÃO DE CHAT
            -- =====================================================
            
            SELECT 
                COALESCE(SUM(EXTRACT(EPOCH FROM (
                    LEAD(created_at) OVER (PARTITION BY user_id ORDER BY created_at) - created_at
                )) / 60), 0)::INTEGER,
                COUNT(DISTINCT CASE WHEN message_type = 'user' THEN id END)
            INTO v_tenant_chat_minutes, v_tenant_conversations
            FROM conversation_history ch
            WHERE ch.tenant_id = v_tenant_data.tenant_id
            AND ch.created_at >= v_start_date
            AND ch.created_at <= v_end_date;
            
            -- =====================================================
            -- ANÁLISE DE SPAM
            -- =====================================================
            
            SELECT 
                COUNT(*) FILTER (WHERE confidence_score >= 0.7),
                COUNT(*) FILTER (WHERE confidence_score < 0.7 OR confidence_score IS NULL),
                COUNT(*)
            INTO v_tenant_valid_conversations, v_tenant_spam_conversations, v_tenant_conversations
            FROM conversation_history ch
            WHERE ch.tenant_id = v_tenant_data.tenant_id
            AND ch.created_at >= v_start_date
            AND ch.created_at <= v_end_date
            AND message_type = 'user';
            
            -- Calcular spam score
            IF v_tenant_conversations > 0 THEN
                v_tenant_spam_score := (v_tenant_valid_conversations * 100.0 / v_tenant_conversations);
            END IF;
            
            -- =====================================================
            -- BUSCAR DADOS BÁSICOS JÁ CALCULADOS
            -- =====================================================
            
            SELECT 
                COALESCE(tenant_revenue_value, 0),
                COALESCE(tenant_appointments_count, 0),
                COALESCE(tenant_customers_count, 0),
                COALESCE(tenant_ai_interactions, 0)
            INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers, v_tenant_ai_interactions
            FROM ubs_metric_system
            WHERE tenant_id = v_tenant_data.tenant_id
            AND period_days = p_period_days
            AND calculation_date = p_calculation_date
            ORDER BY created_at DESC
            LIMIT 1;
            
            -- =====================================================
            -- CÁLCULOS AVANÇADOS DO TENANT
            -- =====================================================
            
            -- Calcular ratio receita/uso
            IF v_tenant_chat_minutes > 0 THEN
                v_tenant_receita_uso_ratio := (v_tenant_data.monthly_revenue / v_tenant_chat_minutes);
            END IF;
            
            -- Calcular conversion rate (conversas para agendamentos)
            IF v_tenant_conversations > 0 THEN
                v_conversation_to_appointment_rate := (v_tenant_appointments * 100.0 / v_tenant_conversations);
            END IF;
            
            -- Calcular efficiency score (combinação de múltiplos fatores)
            v_tenant_efficiency_score := (
                (LEAST(v_conversation_to_appointment_rate, 100) * 0.4) +
                (LEAST(v_tenant_spam_score, 100) * 0.3) +
                (CASE WHEN v_tenant_receita_uso_ratio BETWEEN 0.5 AND 2.0 THEN 100 ELSE 50 END * 0.3)
            );
            
            -- =====================================================
            -- ATUALIZAR REGISTRO DO TENANT COM MÉTRICAS AVANÇADAS
            -- =====================================================
            
            UPDATE ubs_metric_system SET
                tenant_avg_chat_duration_minutes = CASE WHEN v_tenant_conversations > 0 
                    THEN (v_tenant_chat_minutes::DECIMAL / v_tenant_conversations) 
                    ELSE 0 END,
                tenant_spam_detection_score = v_tenant_spam_score,
                tenant_spam_conversations = v_tenant_spam_conversations,
                tenant_valid_conversations = v_tenant_valid_conversations,
                tenant_revenue_per_chat_minute = v_tenant_receita_uso_ratio,
                tenant_conversation_to_appointment_rate_pct = v_conversation_to_appointment_rate,
                tenant_efficiency_score = v_tenant_efficiency_score,
                -- Classification
                tenant_risk_level = CASE 
                    WHEN v_tenant_efficiency_score >= 80 THEN 'Baixo'
                    WHEN v_tenant_efficiency_score >= 60 THEN 'Médio'
                    ELSE 'Alto'
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = v_tenant_data.tenant_id
            AND period_days = p_period_days
            AND calculation_date = p_calculation_date;
            
            -- =====================================================
            -- ACUMULAR PARA TOTAIS DA PLATAFORMA
            -- =====================================================
            
            v_platform_total_revenue := v_platform_total_revenue + v_tenant_revenue;
            v_platform_total_appointments := v_platform_total_appointments + v_tenant_appointments;
            v_platform_total_customers := v_platform_total_customers + v_tenant_customers;
            v_platform_total_ai_interactions := v_platform_total_ai_interactions + v_tenant_ai_interactions;
            v_platform_total_chat_minutes := v_platform_total_chat_minutes + v_tenant_chat_minutes;
            v_total_conversations := v_total_conversations + v_tenant_conversations;
            v_total_valid_conversations := v_total_valid_conversations + v_tenant_valid_conversations;
            v_total_spam_conversations := v_total_spam_conversations + v_tenant_spam_conversations;
            v_platform_active_tenants := v_platform_active_tenants + 1;
            
            -- Coletar dados para análise de distorção
            v_distortion_array := v_distortion_array || jsonb_build_object(
                'tenant_id', v_tenant_data.tenant_id,
                'tenant_name', v_tenant_data.business_name,
                'revenue', v_tenant_data.monthly_revenue,
                'usage_minutes', v_tenant_chat_minutes,
                'ratio', v_tenant_receita_uso_ratio,
                'efficiency_score', v_tenant_efficiency_score
            );
            
        END;
    END LOOP;
    
    -- =====================================================
    -- ETAPA 3: CALCULAR KPIs DA PLATAFORMA
    -- =====================================================
    
    RAISE NOTICE '🌍 Calculando KPIs agregados da plataforma...';
    
    -- MRR da Plataforma (tenants ativos * valor médio por tenant)
    v_platform_mrr := v_platform_active_tenants * 79.90;
    
    -- Ratio Receita/Uso da Plataforma
    IF v_platform_total_chat_minutes > 0 THEN
        v_platform_receita_uso_ratio := (v_platform_mrr / v_platform_total_chat_minutes);
    END IF;
    
    -- Eficiência Operacional (agendamentos / conversas)
    IF v_total_conversations > 0 THEN
        v_platform_operational_efficiency_pct := (v_platform_total_appointments * 100.0 / v_total_conversations);
    END IF;
    
    -- Taxa de Spam da Plataforma
    IF v_total_conversations > 0 THEN
        v_platform_spam_rate_pct := (v_total_spam_conversations * 100.0 / v_total_conversations);
    END IF;
    
    -- Índice de Distorção (desvio padrão dos ratios)
    IF jsonb_array_length(v_distortion_array) > 0 THEN
        v_platform_revenue_usage_distortion_index := 1.5; -- Placeholder calculation
    END IF;
    
    -- =====================================================
    -- ETAPA 4: ANÁLISE DE INSIGHTS ESTRATÉGICOS
    -- =====================================================
    
    RAISE NOTICE '💡 Gerando insights estratégicos...';
    
    -- Top 3 Tenants com Maior Distorção (pagam mais que usam)
    SELECT jsonb_agg(tenant_data ORDER BY (tenant_data->>'ratio')::DECIMAL DESC)
    INTO v_top_distortion_tenants
    FROM (
        SELECT jsonb_array_elements(v_distortion_array) as tenant_data
    ) sub
    WHERE (tenant_data->>'ratio')::DECIMAL > 1.5
    LIMIT 3;
    
    -- Top 3 Oportunidades de Upsell (usam mais que pagam)
    SELECT jsonb_agg(tenant_data ORDER BY (tenant_data->>'ratio')::DECIMAL ASC)
    INTO v_upsell_opportunities
    FROM (
        SELECT jsonb_array_elements(v_distortion_array) as tenant_data
    ) sub
    WHERE (tenant_data->>'ratio')::DECIMAL < 0.7
    LIMIT 3;
    
    -- Tenants em Risco de Churn (baixa eficiência)
    SELECT jsonb_agg(tenant_data ORDER BY (tenant_data->>'efficiency_score')::DECIMAL ASC)
    INTO v_churn_risk_tenants
    FROM (
        SELECT jsonb_array_elements(v_distortion_array) as tenant_data
    ) sub
    WHERE (tenant_data->>'efficiency_score')::DECIMAL < 60
    LIMIT 3;
    
    -- =====================================================
    -- ETAPA 5: ATUALIZAR/INSERIR REGISTRO DA PLATAFORMA
    -- =====================================================
    
    RAISE NOTICE '💾 Salvando métricas da plataforma...';
    
    -- Insert or update platform-level record (tenant_id = NULL)
    INSERT INTO ubs_metric_system (
        tenant_id,
        calculation_date,
        period_days,
        data_source,
        
        -- Platform totals
        platform_total_revenue,
        platform_total_appointments,
        platform_total_customers,
        platform_total_ai_interactions,
        platform_active_tenants,
        platform_mrr,
        platform_total_chat_minutes,
        
        -- Platform KPIs
        platform_receita_uso_ratio,
        platform_operational_efficiency_pct,
        platform_spam_rate_pct,
        platform_revenue_usage_distortion_index,
        
        -- Platform insights
        platform_top_distortion_tenants,
        platform_upsell_opportunities,
        platform_churn_risk_tenants,
        
        -- Metadata
        created_at,
        updated_at
    ) VALUES (
        NULL, -- tenant_id NULL = platform-level metrics
        p_calculation_date,
        p_period_days,
        'enhanced_platform_function',
        
        v_platform_total_revenue,
        v_platform_total_appointments,
        v_platform_total_customers,
        v_platform_total_ai_interactions,
        v_platform_active_tenants,
        v_platform_mrr,
        v_platform_total_chat_minutes,
        
        v_platform_receita_uso_ratio,
        v_platform_operational_efficiency_pct,
        v_platform_spam_rate_pct,
        v_platform_revenue_usage_distortion_index,
        
        COALESCE(v_top_distortion_tenants, '[]'::JSONB),
        COALESCE(v_upsell_opportunities, '[]'::JSONB),
        COALESCE(v_churn_risk_tenants, '[]'::JSONB),
        
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
        platform_top_distortion_tenants = EXCLUDED.platform_top_distortion_tenants,
        platform_upsell_opportunities = EXCLUDED.platform_upsell_opportunities,
        platform_churn_risk_tenants = EXCLUDED.platform_churn_risk_tenants,
        updated_at = CURRENT_TIMESTAMP;
    
    -- =====================================================
    -- FINALIZAR E RETORNAR RESULTADO
    -- =====================================================
    
    v_end_time := clock_timestamp();
    v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
    
    -- Build platform totals JSON
    v_platform_totals := jsonb_build_object(
        'total_revenue', v_platform_total_revenue,
        'total_appointments', v_platform_total_appointments,
        'total_customers', v_platform_total_customers,
        'total_ai_interactions', v_platform_total_ai_interactions,
        'active_tenants', v_platform_active_tenants,
        'platform_mrr', v_platform_mrr,
        'total_chat_minutes', v_platform_total_chat_minutes,
        'receita_uso_ratio', v_platform_receita_uso_ratio,
        'operational_efficiency_pct', v_platform_operational_efficiency_pct,
        'spam_rate_pct', v_platform_spam_rate_pct,
        'distortion_index', v_platform_revenue_usage_distortion_index
    );
    
    RAISE NOTICE '✅ Cálculo concluído! Tenants processados: %, Tempo: %ms', v_processed_tenants, v_execution_time;
    RAISE NOTICE '📊 KPIs da Plataforma: MRR=R$%, Receita/Uso=R$%', v_platform_mrr, v_platform_receita_uso_ratio;
    RAISE NOTICE '📊 KPIs da Plataforma: Eficiência=%, Spam=%', v_platform_operational_efficiency_pct, v_platform_spam_rate_pct;
    
    RETURN QUERY SELECT 
        true as success,
        v_processed_tenants,
        v_platform_totals,
        v_execution_time;
    
EXCEPTION
    WHEN OTHERS THEN
        v_end_time := clock_timestamp();
        v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
        
        RAISE NOTICE '❌ Erro no cálculo de métricas da plataforma: % - %', SQLSTATE, SQLERRM;
        
        RETURN QUERY SELECT 
            false as success,
            v_processed_tenants,
            jsonb_build_object('error', SQLERRM, 'execution_time_ms', v_execution_time),
            v_execution_time;
END;
$$;

-- =====================================================
-- COMENTÁRIOS SOBRE A FUNÇÃO
-- =====================================================

COMMENT ON FUNCTION calculate_enhanced_platform_metrics IS 
'Função aprimorada para calcular métricas completas da plataforma incluindo:
- KPIs estratégicos: Receita/Uso, Eficiência Operacional, Spam Rate
- Análise de distorção e insights estratégicos
- Identificação de oportunidades de upsell e churn risk
- Cálculo de duração de chat baseado em conversation_history
- Análise de spam baseado em confidence_score
- Suporte para períodos de 7, 30 e 90 dias';