-- =====================================================
-- PLATFORM_METRICS REFACTORED SCHEMA
-- Agregação limpa de TODAS as métricas da tenant_metrics
-- =====================================================

-- Backup da tabela atual
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_metrics') THEN
        DROP TABLE IF EXISTS platform_metrics_backup;
        CREATE TABLE platform_metrics_backup AS 
        SELECT * FROM platform_metrics;
        RAISE NOTICE 'Backup criado: platform_metrics_backup';
    END IF;
END $$;

-- Drop da tabela atual
DROP TABLE IF EXISTS platform_metrics CASCADE;

-- =====================================================
-- NOVA TABELA PLATFORM_METRICS - AGREGAÇÃO PURA
-- =====================================================
CREATE TABLE platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    period VARCHAR(10) NOT NULL, -- '7d', '30d', '90d'
    
    -- METADATA DA AGREGAÇÃO
    tenants_processed INTEGER NOT NULL DEFAULT 0,
    total_tenants INTEGER NOT NULL DEFAULT 0,
    calculation_method VARCHAR(50) DEFAULT 'tenant_aggregation',
    data_quality_score DECIMAL(5,2) DEFAULT 100.0,
    
    -- =====================================================
    -- PLATFORM MRR (do custo_plataforma)
    -- =====================================================
    platform_mrr DECIMAL(15,2) DEFAULT 0, -- SUM(custo_total_plataforma)
    
    -- =====================================================
    -- MÉTRICAS DE RECEITA (do comprehensive + revenue_tenant)
    -- =====================================================
    total_revenue DECIMAL(15,2) DEFAULT 0, -- SUM(monthly_revenue_brl)
    revenue_per_customer DECIMAL(10,2) DEFAULT 0, -- AVG(revenue_per_customer)
    revenue_per_appointment DECIMAL(10,2) DEFAULT 0, -- AVG(revenue_per_appointment)
    total_revenue_validation DECIMAL(15,2) DEFAULT 0, -- SUM do revenue_tenant para validação
    roi_per_conversation DECIMAL(10,4) DEFAULT 0, -- AVG(roi_per_conversation)
    
    -- =====================================================
    -- MÉTRICAS OPERACIONAIS (do comprehensive)
    -- =====================================================
    active_tenants INTEGER DEFAULT 0, -- COUNT DISTINCT com appointments > 0
    total_appointments INTEGER DEFAULT 0, -- SUM(total_appointments)
    total_chat_minutes DECIMAL(12,2) DEFAULT 0, -- SUM(total_chat_minutes)
    total_new_customers INTEGER DEFAULT 0, -- SUM(new_customers_count)
    total_sessions INTEGER DEFAULT 0, -- SUM(unique_sessions_count)
    total_professionals INTEGER DEFAULT 0, -- SUM(professionals_count)
    total_services INTEGER DEFAULT 0, -- SUM(services_count)
    
    -- =====================================================
    -- MÉTRICAS DE PERFORMANCE (médias ponderadas)
    -- =====================================================
    avg_appointment_success_rate DECIMAL(5,2) DEFAULT 0, -- AVG(appointment_success_rate)
    avg_whatsapp_quality_score DECIMAL(5,2) DEFAULT 0, -- AVG(whatsapp_quality_score)
    avg_customer_satisfaction_score DECIMAL(5,2) DEFAULT 0, -- AVG(customer_satisfaction_score)
    avg_conversion_rate DECIMAL(5,2) DEFAULT 0, -- AVG(conversion_rate)
    avg_customer_retention_rate DECIMAL(5,2) DEFAULT 0, -- AVG(customer_retention_rate)
    avg_customer_recurrence_rate DECIMAL(5,2) DEFAULT 0, -- AVG(customer_recurrence_rate)
    
    -- =====================================================
    -- MÉTRICAS DE EFICIÊNCIA (médias ponderadas)
    -- =====================================================
    avg_ai_assistant_efficiency DECIMAL(5,2) DEFAULT 0, -- AVG(ai_assistant_efficiency)
    avg_response_time DECIMAL(8,2) DEFAULT 0, -- AVG(response_time_average)
    avg_business_hours_utilization DECIMAL(5,2) DEFAULT 0, -- AVG(business_hours_utilization)
    avg_minutes_per_conversation DECIMAL(8,2) DEFAULT 0, -- AVG(avg_minutes_per_conversation)
    
    -- =====================================================
    -- MÉTRICAS DE CUSTO (do comprehensive + conversation_billing)
    -- =====================================================
    avg_customer_acquisition_cost DECIMAL(10,2) DEFAULT 0, -- AVG(customer_acquisition_cost)
    avg_profit_margin_percentage DECIMAL(5,2) DEFAULT 0, -- AVG(profit_margin_percentage)
    total_platform_cost_usd DECIMAL(15,2) DEFAULT 0, -- SUM do conversation_billing
    avg_cost_per_conversation DECIMAL(8,4) DEFAULT 0, -- AVG(avg_cost_per_conversation)
    
    -- =====================================================
    -- MÉTRICAS DE QUALIDADE (do conversation_billing)
    -- =====================================================
    total_billable_conversations INTEGER DEFAULT 0, -- SUM(billable_conversations)
    avg_efficiency_pct DECIMAL(5,2) DEFAULT 0, -- AVG(efficiency_pct)
    avg_spam_rate_pct DECIMAL(5,2) DEFAULT 0, -- AVG(spam_rate_pct)
    
    -- =====================================================
    -- MÉTRICAS CALCULADAS (derivadas)
    -- =====================================================
    revenue_platform_ratio DECIMAL(8,4) DEFAULT 0, -- total_revenue / platform_mrr
    avg_revenue_per_tenant DECIMAL(12,2) DEFAULT 0, -- total_revenue / active_tenants
    avg_appointments_per_tenant DECIMAL(8,2) DEFAULT 0, -- total_appointments / active_tenants
    avg_sessions_per_tenant DECIMAL(8,2) DEFAULT 0, -- total_sessions / active_tenants
    avg_customers_per_tenant DECIMAL(8,2) DEFAULT 0, -- total_new_customers / active_tenants
    platform_utilization_score DECIMAL(5,2) DEFAULT 0, -- Score derivado de várias métricas
    
    -- TIMESTAMPS
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- CONSTRAINTS
    CONSTRAINT platform_metrics_period_check CHECK (period IN ('7d', '30d', '90d')),
    CONSTRAINT platform_metrics_positive_values CHECK (
        platform_mrr >= 0 AND
        total_revenue >= 0 AND
        active_tenants >= 0 AND
        total_appointments >= 0
    )
);

-- =====================================================
-- ÍNDICES OTIMIZADOS
-- =====================================================
CREATE UNIQUE INDEX idx_platform_metrics_date_period 
ON platform_metrics(calculation_date, period);

CREATE INDEX idx_platform_metrics_date_desc 
ON platform_metrics(calculation_date DESC);

CREATE INDEX idx_platform_metrics_period 
ON platform_metrics(period);

CREATE INDEX idx_platform_metrics_created_at 
ON platform_metrics(created_at DESC);

-- =====================================================
-- RLS POLICIES - APENAS SUPER ADMIN
-- =====================================================
ALTER TABLE platform_metrics ENABLE ROW LEVEL SECURITY;

-- Policy para super admin apenas
CREATE POLICY "super_admin_platform_metrics_all" 
ON platform_metrics FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
    )
);

-- =====================================================
-- FUNÇÃO DE AGREGAÇÃO PRINCIPAL
-- =====================================================
CREATE OR REPLACE FUNCTION aggregate_platform_metrics(
    target_date DATE DEFAULT CURRENT_DATE,
    target_period VARCHAR(10) DEFAULT '30d'
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    tenants_count INTEGER;
    processed_count INTEGER;
BEGIN
    -- Limpar dados existentes para o período
    DELETE FROM platform_metrics 
    WHERE calculation_date = target_date AND period = target_period;
    
    -- Contar tenants disponíveis
    SELECT COUNT(DISTINCT tenant_id)
    INTO tenants_count
    FROM tenant_metrics
    WHERE period = target_period
    AND DATE(calculated_at) = target_date;
    
    -- Contar tenants processados (com dados comprehensive)
    SELECT COUNT(DISTINCT tenant_id)
    INTO processed_count
    FROM tenant_metrics
    WHERE period = target_period
    AND metric_type = 'comprehensive'
    AND DATE(calculated_at) = target_date;
    
    -- AGREGAÇÃO PRINCIPAL
    INSERT INTO platform_metrics (
        calculation_date,
        period,
        tenants_processed,
        total_tenants,
        
        -- PLATFORM MRR
        platform_mrr,
        
        -- RECEITA
        total_revenue,
        revenue_per_customer,
        revenue_per_appointment,
        total_revenue_validation,
        roi_per_conversation,
        
        -- OPERACIONAL
        active_tenants,
        total_appointments,
        total_chat_minutes,
        total_new_customers,
        total_sessions,
        total_professionals,
        total_services,
        
        -- PERFORMANCE
        avg_appointment_success_rate,
        avg_whatsapp_quality_score,
        avg_customer_satisfaction_score,
        avg_conversion_rate,
        avg_customer_retention_rate,
        avg_customer_recurrence_rate,
        
        -- EFICIÊNCIA
        avg_ai_assistant_efficiency,
        avg_response_time,
        avg_business_hours_utilization,
        avg_minutes_per_conversation,
        
        -- CUSTO
        avg_customer_acquisition_cost,
        avg_profit_margin_percentage,
        total_platform_cost_usd,
        avg_cost_per_conversation,
        
        -- QUALIDADE
        total_billable_conversations,
        avg_efficiency_pct,
        avg_spam_rate_pct
    )
    SELECT 
        target_date as calculation_date,
        target_period as period,
        processed_count as tenants_processed,
        tenants_count as total_tenants,
        
        -- PLATFORM MRR (do custo_plataforma)
        COALESCE(SUM(CASE 
            WHEN metric_type = 'custo_plataforma' 
            THEN (metric_data->>'custo_total_plataforma')::DECIMAL 
            ELSE 0 
        END), 0) as platform_mrr,
        
        -- RECEITA (do comprehensive)
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'monthly_revenue_brl')::DECIMAL 
            ELSE 0 
        END), 0) as total_revenue,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'revenue_per_customer')::DECIMAL > 0
            THEN (metric_data->>'revenue_per_customer')::DECIMAL 
        END), 0) as revenue_per_customer,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'revenue_per_appointment')::DECIMAL > 0
            THEN (metric_data->>'revenue_per_appointment')::DECIMAL 
        END), 0) as revenue_per_appointment,
        
        -- VALIDAÇÃO (do revenue_tenant)
        COALESCE(SUM(CASE 
            WHEN metric_type = 'revenue_tenant' 
            THEN (metric_data->>'total_revenue')::DECIMAL 
            ELSE 0 
        END), 0) as total_revenue_validation,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'roi_per_conversation')::DECIMAL != 0
            THEN (metric_data->>'roi_per_conversation')::DECIMAL 
        END), 0) as roi_per_conversation,
        
        -- OPERACIONAL
        COUNT(DISTINCT CASE 
            WHEN metric_type = 'comprehensive' 
            AND (metric_data->>'total_appointments')::INTEGER > 0 
            THEN tenant_id 
        END) as active_tenants,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'total_appointments')::INTEGER 
            ELSE 0 
        END), 0) as total_appointments,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'total_chat_minutes')::DECIMAL 
            ELSE 0 
        END), 0) as total_chat_minutes,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'new_customers_count')::INTEGER 
            ELSE 0 
        END), 0) as total_new_customers,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'unique_sessions_count')::INTEGER 
            ELSE 0 
        END), 0) as total_sessions,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'professionals_count')::INTEGER 
            ELSE 0 
        END), 0) as total_professionals,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'comprehensive' 
            THEN (metric_data->>'services_count')::INTEGER 
            ELSE 0 
        END), 0) as total_services,
        
        -- PERFORMANCE (médias ponderadas)
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'appointment_success_rate')::DECIMAL > 0
            THEN (metric_data->>'appointment_success_rate')::DECIMAL 
        END), 0) as avg_appointment_success_rate,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'whatsapp_quality_score')::DECIMAL > 0
            THEN (metric_data->>'whatsapp_quality_score')::DECIMAL 
        END), 0) as avg_whatsapp_quality_score,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'customer_satisfaction_score')::DECIMAL > 0
            THEN (metric_data->>'customer_satisfaction_score')::DECIMAL 
        END), 0) as avg_customer_satisfaction_score,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'conversation_conversion_rate')::DECIMAL > 0
            THEN (metric_data->>'conversation_conversion_rate')::DECIMAL 
        END), 0) as avg_conversion_rate,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'customer_retention_rate')::DECIMAL > 0
            THEN (metric_data->>'customer_retention_rate')::DECIMAL 
        END), 0) as avg_customer_retention_rate,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'customer_recurrence_rate')::DECIMAL > 0
            THEN (metric_data->>'customer_recurrence_rate')::DECIMAL 
        END), 0) as avg_customer_recurrence_rate,
        
        -- EFICIÊNCIA (médias ponderadas)
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'ai_assistant_efficiency')::DECIMAL > 0
            THEN (metric_data->>'ai_assistant_efficiency')::DECIMAL 
        END), 0) as avg_ai_assistant_efficiency,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'response_time_average')::DECIMAL > 0
            THEN (metric_data->>'response_time_average')::DECIMAL 
        END), 0) as avg_response_time,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'business_hours_utilization')::DECIMAL > 0
            THEN (metric_data->>'business_hours_utilization')::DECIMAL 
        END), 0) as avg_business_hours_utilization,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'avg_minutes_per_conversation')::DECIMAL > 0
            THEN (metric_data->>'avg_minutes_per_conversation')::DECIMAL 
        END), 0) as avg_minutes_per_conversation,
        
        -- CUSTO
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'customer_acquisition_cost')::DECIMAL > 0
            THEN (metric_data->>'customer_acquisition_cost')::DECIMAL 
        END), 0) as avg_customer_acquisition_cost,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'comprehensive' AND (metric_data->>'profit_margin_percentage')::DECIMAL > 0
            THEN (metric_data->>'profit_margin_percentage')::DECIMAL 
        END), 0) as avg_profit_margin_percentage,
        
        COALESCE(SUM(CASE 
            WHEN metric_type = 'conversation_billing' 
            THEN (metric_data->>'total_cost_usd')::DECIMAL 
            ELSE 0 
        END), 0) as total_platform_cost_usd,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'conversation_billing' AND (metric_data->>'avg_cost_per_conversation')::DECIMAL > 0
            THEN (metric_data->>'avg_cost_per_conversation')::DECIMAL 
        END), 0) as avg_cost_per_conversation,
        
        -- QUALIDADE
        COALESCE(SUM(CASE 
            WHEN metric_type = 'conversation_billing' 
            THEN (metric_data->>'billable_conversations')::INTEGER 
            ELSE 0 
        END), 0) as total_billable_conversations,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'conversation_billing' AND (metric_data->>'efficiency_pct')::DECIMAL > 0
            THEN (metric_data->>'efficiency_pct')::DECIMAL 
        END), 0) as avg_efficiency_pct,
        
        COALESCE(AVG(CASE 
            WHEN metric_type = 'conversation_billing' AND (metric_data->>'spam_rate_pct')::DECIMAL >= 0
            THEN (metric_data->>'spam_rate_pct')::DECIMAL 
        END), 0) as avg_spam_rate_pct
        
    FROM tenant_metrics
    WHERE period = target_period
    AND DATE(calculated_at) = target_date;
    
    -- CALCULAR MÉTRICAS DERIVADAS
    UPDATE platform_metrics SET
        revenue_platform_ratio = CASE 
            WHEN platform_mrr > 0 THEN total_revenue / platform_mrr 
            ELSE 0 
        END,
        avg_revenue_per_tenant = CASE 
            WHEN active_tenants > 0 THEN total_revenue / active_tenants 
            ELSE 0 
        END,
        avg_appointments_per_tenant = CASE 
            WHEN active_tenants > 0 THEN total_appointments::DECIMAL / active_tenants 
            ELSE 0 
        END,
        avg_sessions_per_tenant = CASE 
            WHEN active_tenants > 0 THEN total_sessions::DECIMAL / active_tenants 
            ELSE 0 
        END,
        avg_customers_per_tenant = CASE 
            WHEN active_tenants > 0 THEN total_new_customers::DECIMAL / active_tenants 
            ELSE 0 
        END,
        platform_utilization_score = (
            (avg_appointment_success_rate * 0.3) +
            (avg_customer_satisfaction_score * 0.25) +
            (avg_ai_assistant_efficiency * 0.25) +
            ((100 - avg_spam_rate_pct) * 0.2)
        ),
        updated_at = now()
    WHERE calculation_date = target_date AND period = target_period;
    
    -- Retornar resultado
    SELECT jsonb_build_object(
        'success', true,
        'calculation_date', target_date,
        'period', target_period,
        'tenants_processed', processed_count,
        'total_tenants', tenants_count,
        'message', format('Platform metrics agregados para %s tenants no período %s', processed_count, target_period)
    ) INTO result;
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', 'Erro ao agregar platform metrics'
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO DE VALIDAÇÃO DE CONSISTÊNCIA
-- =====================================================
CREATE OR REPLACE FUNCTION validate_platform_aggregation(
    target_date DATE DEFAULT CURRENT_DATE,
    target_period VARCHAR(10) DEFAULT '30d'
) RETURNS JSONB AS $$
DECLARE
    platform_data RECORD;
    tenant_sum_revenue DECIMAL;
    tenant_sum_appointments INTEGER;
    tenant_count INTEGER;
    discrepancies JSONB := '[]'::JSONB;
    validation_result JSONB;
BEGIN
    -- Buscar dados da platform_metrics
    SELECT * INTO platform_data
    FROM platform_metrics
    WHERE calculation_date = target_date AND period = target_period;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Platform metrics não encontrados para validação'
        );
    END IF;
    
    -- Somar receita diretamente dos tenants (comprehensive)
    SELECT 
        COALESCE(SUM((metric_data->>'monthly_revenue_brl')::DECIMAL), 0),
        COALESCE(SUM((metric_data->>'total_appointments')::INTEGER), 0),
        COUNT(DISTINCT tenant_id)
    INTO tenant_sum_revenue, tenant_sum_appointments, tenant_count
    FROM tenant_metrics
    WHERE period = target_period
    AND metric_type = 'comprehensive'
    AND DATE(calculated_at) = target_date;
    
    -- Verificar discrepâncias
    IF ABS(platform_data.total_revenue - tenant_sum_revenue) > 0.01 THEN
        discrepancies := discrepancies || jsonb_build_object(
            'field', 'total_revenue',
            'platform_value', platform_data.total_revenue,
            'tenant_sum', tenant_sum_revenue,
            'difference', platform_data.total_revenue - tenant_sum_revenue
        );
    END IF;
    
    IF platform_data.total_appointments != tenant_sum_appointments THEN
        discrepancies := discrepancies || jsonb_build_object(
            'field', 'total_appointments',
            'platform_value', platform_data.total_appointments,
            'tenant_sum', tenant_sum_appointments,
            'difference', platform_data.total_appointments - tenant_sum_appointments
        );
    END IF;
    
    -- Construir resultado
    validation_result := jsonb_build_object(
        'success', true,
        'calculation_date', target_date,
        'period', target_period,
        'consistent', (jsonb_array_length(discrepancies) = 0),
        'tenants_validated', tenant_count,
        'discrepancies', discrepancies,
        'platform_metrics', jsonb_build_object(
            'total_revenue', platform_data.total_revenue,
            'total_appointments', platform_data.total_appointments,
            'active_tenants', platform_data.active_tenants,
            'platform_mrr', platform_data.platform_mrr
        ),
        'tenant_sums', jsonb_build_object(
            'total_revenue', tenant_sum_revenue,
            'total_appointments', tenant_sum_appointments,
            'active_tenants', tenant_count
        )
    );
    
    RETURN validation_result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', 'Erro na validação de agregação'
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS DA TABELA
-- =====================================================
COMMENT ON TABLE platform_metrics IS 'Agregação de todas as métricas dos tenants - fonte única de verdade para platform-wide analytics';

COMMENT ON COLUMN platform_metrics.platform_mrr IS 'MRR da plataforma - SUM(custo_total_plataforma) dos tenants';
COMMENT ON COLUMN platform_metrics.total_revenue IS 'Receita total dos negócios dos tenants - SUM(monthly_revenue_brl)';
COMMENT ON COLUMN platform_metrics.total_revenue_validation IS 'Receita de validação do revenue_tenant para auditoria';
COMMENT ON COLUMN platform_metrics.active_tenants IS 'Tenants com pelo menos 1 agendamento no período';
COMMENT ON COLUMN platform_metrics.revenue_platform_ratio IS 'Ratio receita dos negócios / custo da plataforma';
COMMENT ON COLUMN platform_metrics.platform_utilization_score IS 'Score agregado de utilização da plataforma (0-100)';

-- =====================================================
-- TRIGGER PARA AUTO-UPDATE
-- =====================================================
CREATE OR REPLACE FUNCTION platform_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_metrics_updated_at_trigger
    BEFORE UPDATE ON platform_metrics
    FOR EACH ROW
    EXECUTE FUNCTION platform_metrics_updated_at();

-- =====================================================
-- GRANTS DE SEGURANÇA
-- =====================================================
REVOKE ALL ON platform_metrics FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_metrics TO service_role;

-- =====================================================
-- SUCESSO
-- =====================================================
SELECT 'Schema platform_metrics refatorado com sucesso! ✅' as status;