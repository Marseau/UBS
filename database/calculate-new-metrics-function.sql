-- =====================================================
-- NOVA FUNÇÃO PARA CALCULAR MÉTRICAS SEM REDUNDÂNCIA
-- =====================================================
-- Popula tenant_metrics (dados individuais) e platform_metrics (dados agregados)
-- Elimina redundância da estrutura anterior
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_new_metrics_system(
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
    
    -- Platform aggregations (acumuladores)
    v_platform_total_revenue DECIMAL(12,2) := 0;
    v_platform_total_appointments INTEGER := 0;
    v_platform_total_customers INTEGER := 0;
    v_platform_total_ai_interactions INTEGER := 0;
    v_platform_active_tenants INTEGER := 0;
    v_platform_total_chat_minutes INTEGER := 0;
    v_platform_mrr DECIMAL(12,2) := 0;
    
    -- Platform advanced metrics
    v_platform_receita_uso_ratio DECIMAL(10,2) := 0;
    v_platform_operational_efficiency_pct DECIMAL(5,2) := 0;
    v_platform_spam_rate_pct DECIMAL(5,2) := 0;
    v_platform_cancellation_rate_pct DECIMAL(5,2) := 0;
    
    -- Platform conversation totals
    v_total_conversations INTEGER := 0;
    v_total_valid_conversations INTEGER := 0;
    v_total_spam_conversations INTEGER := 0;
    v_total_cancelled_appointments INTEGER := 0;
    v_total_rescheduled_appointments INTEGER := 0;
    
BEGIN
    v_start_time := clock_timestamp();
    
    -- Para agendamentos: olhar para o futuro (próximos X dias)
    v_start_date := p_calculation_date;
    v_end_date := p_calculation_date + INTERVAL '1 day' * p_period_days;
    
    RAISE NOTICE 'Iniciando novo sistema de métricas para período FUTURO: % a %', v_start_date, v_end_date;
    
    -- =====================================================
    -- ETAPA 1: PROCESSAR CADA TENANT INDIVIDUALMENTE
    -- =====================================================
    
    FOR v_tenant_data IN 
        SELECT DISTINCT 
            t.id as tenant_id,
            t.business_name,
            79.90 as monthly_revenue  -- Valor fixo por enquanto
        FROM tenants t 
        WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
        AND t.status = 'active'
    LOOP
        v_processed_tenants := v_processed_tenants + 1;
        
        DECLARE
            -- Variáveis do tenant
            v_tenant_revenue DECIMAL(12,2) := v_tenant_data.monthly_revenue;
            v_tenant_appointments INTEGER := 0;
            v_tenant_appointments_confirmed INTEGER := 0;
            v_tenant_appointments_cancelled INTEGER := 0;
            v_tenant_appointments_rescheduled INTEGER := 0;
            v_tenant_customers INTEGER := 0;
            v_tenant_ai_interactions INTEGER := 0;
            v_tenant_conversations INTEGER := 0;
            v_tenant_valid_conversations INTEGER := 0;
            v_tenant_spam_conversations INTEGER := 0;
            v_tenant_chat_minutes INTEGER := 0;
            
            -- Métricas calculadas do tenant
            v_tenant_avg_chat_duration DECIMAL(8,2) := 0;
            v_tenant_spam_score DECIMAL(5,2) := 0;
            v_tenant_revenue_per_minute DECIMAL(10,2) := 0;
            v_tenant_conversion_rate DECIMAL(5,2) := 0;
            v_tenant_efficiency_score DECIMAL(8,2) := 0;
            v_tenant_risk_level VARCHAR(10) := 'Médio';
            
        BEGIN
            
            -- =====================================================
            -- BUSCAR DADOS BÁSICOS DO TENANT
            -- =====================================================
            
            -- Agendamentos do tenant (usando appointment_date - futuro, não criação)
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE a.status::text ILIKE '%confirm%'),
                COUNT(*) FILTER (WHERE a.status::text ILIKE '%cancel%'),
                COUNT(*) FILTER (WHERE a.status::text ILIKE '%reschedul%' OR a.status::text ILIKE '%remarc%')
            INTO v_tenant_appointments, v_tenant_appointments_confirmed, 
                 v_tenant_appointments_cancelled, v_tenant_appointments_rescheduled
            FROM appointments a
            WHERE a.tenant_id = v_tenant_data.tenant_id
            AND a.appointment_date >= v_start_date
            AND a.appointment_date <= v_end_date;
            
            -- Clientes únicos do tenant (baseado em agendamentos futuros)
            SELECT COUNT(DISTINCT user_id)
            INTO v_tenant_customers
            FROM appointments a
            WHERE a.tenant_id = v_tenant_data.tenant_id
            AND a.appointment_date >= v_start_date
            AND a.appointment_date <= v_end_date;
            
            -- Conversas do tenant (histórico - últimos X dias)
            SELECT 
                COUNT(*) FILTER (WHERE message_type = 'user'),
                COUNT(*) FILTER (WHERE message_type = 'user' AND confidence_score >= 0.7),
                COUNT(*) FILTER (WHERE message_type = 'user' AND (confidence_score < 0.7 OR confidence_score IS NULL)),
                COUNT(*) FILTER (WHERE message_type = 'assistant')
            INTO v_tenant_conversations, v_tenant_valid_conversations, 
                 v_tenant_spam_conversations, v_tenant_ai_interactions
            FROM conversation_history ch
            WHERE ch.tenant_id = v_tenant_data.tenant_id
            AND ch.created_at >= (p_calculation_date - INTERVAL '1 day' * p_period_days)
            AND ch.created_at <= p_calculation_date;
            
            -- Estimar duração de chat (5 min por conversa)
            v_tenant_chat_minutes := v_tenant_conversations * 5;
            
            -- =====================================================
            -- CALCULAR MÉTRICAS DO TENANT
            -- =====================================================
            
            -- Duração média de chat
            IF v_tenant_conversations > 0 THEN
                v_tenant_avg_chat_duration := v_tenant_chat_minutes::DECIMAL / v_tenant_conversations;
            END IF;
            
            -- Score de spam
            IF v_tenant_conversations > 0 THEN
                v_tenant_spam_score := (v_tenant_valid_conversations * 100.0 / v_tenant_conversations);
            END IF;
            
            -- Receita por minuto de chat
            IF v_tenant_chat_minutes > 0 THEN
                v_tenant_revenue_per_minute := v_tenant_revenue / v_tenant_chat_minutes;
            END IF;
            
            -- Taxa de conversão (conversas para agendamentos)
            IF v_tenant_conversations > 0 THEN
                v_tenant_conversion_rate := (v_tenant_appointments * 100.0 / v_tenant_conversations);
            END IF;
            
            -- Score de eficiência
            v_tenant_efficiency_score := (
                (LEAST(v_tenant_conversion_rate, 100) * 0.4) +
                (LEAST(v_tenant_spam_score, 100) * 0.3) +
                (CASE WHEN v_tenant_revenue_per_minute BETWEEN 0.5 AND 2.0 THEN 100 ELSE 50 END * 0.3)
            );
            
            -- Nível de risco
            v_tenant_risk_level := CASE 
                WHEN v_tenant_efficiency_score >= 80 THEN 'Baixo'
                WHEN v_tenant_efficiency_score >= 60 THEN 'Médio'
                ELSE 'Alto'
            END;
            
            -- =====================================================
            -- INSERIR/ATUALIZAR DADOS DO TENANT
            -- =====================================================
            
            INSERT INTO tenant_metrics (
                tenant_id,
                calculation_date,
                period_days,
                data_source,
                
                revenue_value,
                appointments_count,
                appointments_confirmed,
                appointments_cancelled,
                appointments_rescheduled,
                customers_count,
                ai_interactions,
                
                total_conversations,
                valid_conversations,
                spam_conversations,
                total_chat_minutes,
                avg_chat_duration_minutes,
                
                spam_detection_score,
                revenue_per_chat_minute,
                conversation_to_appointment_rate_pct,
                efficiency_score,
                risk_level,
                
                created_at,
                updated_at
            ) VALUES (
                v_tenant_data.tenant_id,
                p_calculation_date,
                p_period_days,
                'new_metrics_function',
                
                v_tenant_revenue,
                v_tenant_appointments,
                v_tenant_appointments_confirmed,
                v_tenant_appointments_cancelled,
                v_tenant_appointments_rescheduled,
                v_tenant_customers,
                v_tenant_ai_interactions,
                
                v_tenant_conversations,
                v_tenant_valid_conversations,
                v_tenant_spam_conversations,
                v_tenant_chat_minutes,
                v_tenant_avg_chat_duration,
                
                v_tenant_spam_score,
                v_tenant_revenue_per_minute,
                v_tenant_conversion_rate,
                v_tenant_efficiency_score,
                v_tenant_risk_level,
                
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (tenant_id, calculation_date, period_days, data_source) 
            DO UPDATE SET
                revenue_value = EXCLUDED.revenue_value,
                appointments_count = EXCLUDED.appointments_count,
                appointments_confirmed = EXCLUDED.appointments_confirmed,
                appointments_cancelled = EXCLUDED.appointments_cancelled,
                appointments_rescheduled = EXCLUDED.appointments_rescheduled,
                customers_count = EXCLUDED.customers_count,
                ai_interactions = EXCLUDED.ai_interactions,
                
                total_conversations = EXCLUDED.total_conversations,
                valid_conversations = EXCLUDED.valid_conversations,
                spam_conversations = EXCLUDED.spam_conversations,
                total_chat_minutes = EXCLUDED.total_chat_minutes,
                avg_chat_duration_minutes = EXCLUDED.avg_chat_duration_minutes,
                
                spam_detection_score = EXCLUDED.spam_detection_score,
                revenue_per_chat_minute = EXCLUDED.revenue_per_chat_minute,
                conversation_to_appointment_rate_pct = EXCLUDED.conversation_to_appointment_rate_pct,
                efficiency_score = EXCLUDED.efficiency_score,
                risk_level = EXCLUDED.risk_level,
                updated_at = CURRENT_TIMESTAMP;
            
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
            v_total_cancelled_appointments := v_total_cancelled_appointments + v_tenant_appointments_cancelled;
            v_total_rescheduled_appointments := v_total_rescheduled_appointments + v_tenant_appointments_rescheduled;
            v_platform_active_tenants := v_platform_active_tenants + 1;
            
        END;
    END LOOP;
    
    -- =====================================================
    -- ETAPA 2: CALCULAR KPIs DA PLATAFORMA
    -- =====================================================
    
    RAISE NOTICE 'Calculando KPIs da plataforma...';
    
    -- MRR da Plataforma
    v_platform_mrr := v_platform_active_tenants * 79.90;
    
    -- Ratio Receita/Uso
    IF v_platform_total_chat_minutes > 0 THEN
        v_platform_receita_uso_ratio := (v_platform_mrr / v_platform_total_chat_minutes);
    END IF;
    
    -- Eficiência Operacional
    IF v_total_conversations > 0 THEN
        v_platform_operational_efficiency_pct := (v_platform_total_appointments * 100.0 / v_total_conversations);
    END IF;
    
    -- Taxa de Spam
    IF v_total_conversations > 0 THEN
        v_platform_spam_rate_pct := (v_total_spam_conversations * 100.0 / v_total_conversations);
    END IF;
    
    -- Taxa de Cancelamentos
    IF v_total_conversations > 0 THEN
        v_platform_cancellation_rate_pct := ((v_total_cancelled_appointments + v_total_rescheduled_appointments) * 100.0 / v_total_conversations);
    END IF;
    
    -- =====================================================
    -- ETAPA 3: INSERIR DADOS AGREGADOS DA PLATAFORMA
    -- =====================================================
    
    RAISE NOTICE 'Salvando métricas da plataforma...';
    
    INSERT INTO platform_metrics (
        calculation_date,
        period_days,
        data_source,
        
        total_revenue,
        total_appointments,
        total_customers,
        total_ai_interactions,
        active_tenants,
        platform_mrr,
        
        total_chat_minutes,
        total_conversations,
        total_valid_conversations,
        total_spam_conversations,
        
        receita_uso_ratio,
        operational_efficiency_pct,
        spam_rate_pct,
        cancellation_rate_pct,
        
        created_at,
        updated_at
    ) VALUES (
        p_calculation_date,
        p_period_days,
        'new_metrics_function',
        
        v_platform_total_revenue,
        v_platform_total_appointments,
        v_platform_total_customers,
        v_platform_total_ai_interactions,
        v_platform_active_tenants,
        v_platform_mrr,
        
        v_platform_total_chat_minutes,
        v_total_conversations,
        v_total_valid_conversations,
        v_total_spam_conversations,
        
        v_platform_receita_uso_ratio,
        v_platform_operational_efficiency_pct,
        v_platform_spam_rate_pct,
        v_platform_cancellation_rate_pct,
        
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (calculation_date, period_days, data_source) 
    DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_appointments = EXCLUDED.total_appointments,
        total_customers = EXCLUDED.total_customers,
        total_ai_interactions = EXCLUDED.total_ai_interactions,
        active_tenants = EXCLUDED.active_tenants,
        platform_mrr = EXCLUDED.platform_mrr,
        
        total_chat_minutes = EXCLUDED.total_chat_minutes,
        total_conversations = EXCLUDED.total_conversations,
        total_valid_conversations = EXCLUDED.total_valid_conversations,
        total_spam_conversations = EXCLUDED.total_spam_conversations,
        
        receita_uso_ratio = EXCLUDED.receita_uso_ratio,
        operational_efficiency_pct = EXCLUDED.operational_efficiency_pct,
        spam_rate_pct = EXCLUDED.spam_rate_pct,
        cancellation_rate_pct = EXCLUDED.cancellation_rate_pct,
        updated_at = CURRENT_TIMESTAMP;
    
    -- =====================================================
    -- FINALIZAR E RETORNAR
    -- =====================================================
    
    v_end_time := clock_timestamp();
    v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
    
    v_platform_totals := jsonb_build_object(
        'total_revenue', v_platform_total_revenue,
        'total_appointments', v_platform_total_appointments,
        'total_customers', v_platform_total_customers,
        'active_tenants', v_platform_active_tenants,
        'platform_mrr', v_platform_mrr,
        'receita_uso_ratio', v_platform_receita_uso_ratio,
        'operational_efficiency_pct', v_platform_operational_efficiency_pct,
        'spam_rate_pct', v_platform_spam_rate_pct,
        'cancellation_rate_pct', v_platform_cancellation_rate_pct
    );
    
    RAISE NOTICE 'Novo sistema de métricas concluído! Tenants: %, MRR: R$%, Tempo: %ms', 
        v_processed_tenants, v_platform_mrr, v_execution_time;
    
    RETURN QUERY SELECT 
        true as success,
        v_processed_tenants,
        v_platform_totals,
        v_execution_time;
    
EXCEPTION
    WHEN OTHERS THEN
        v_end_time := clock_timestamp();
        v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
        
        RAISE NOTICE 'Erro no novo sistema de métricas: % - %', SQLSTATE, SQLERRM;
        
        RETURN QUERY SELECT 
            false as success,
            v_processed_tenants,
            jsonb_build_object('error', SQLERRM, 'execution_time_ms', v_execution_time),
            v_execution_time;
END;
$$;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON FUNCTION calculate_new_metrics_system IS 
'Nova função para calcular métricas sem redundância:
- Popula tenant_metrics com dados individuais por tenant
- Popula platform_metrics com dados agregados da plataforma
- Elimina redundância da estrutura anterior
- LÓGICA TEMPORAL CORRETA:
  * Agendamentos: FUTUROS (appointment_date >= hoje + X dias)
  * Conversas: PASSADAS (created_at nos últimos X dias)
  * Receita: Baseada em agendamentos futuros confirmados
- Suporte para períodos de 7, 30 e 90 dias';

-- =====================================================
-- TESTE DA FUNÇÃO
-- =====================================================

-- Para testar:
-- SELECT * FROM calculate_new_metrics_system('2025-07-15', 30, NULL);