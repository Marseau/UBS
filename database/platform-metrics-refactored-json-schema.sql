-- =====================================================
-- PLATFORM_METRICS REFACTORING TO JSON STRUCTURE
-- Converts to 3-field JSON approach like tenant_metrics
-- =====================================================

-- Backup da tabela atual
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_metrics') THEN
        DROP TABLE IF EXISTS platform_metrics_backup_traditional;
        CREATE TABLE platform_metrics_backup_traditional AS 
        SELECT * FROM platform_metrics;
        RAISE NOTICE 'Backup criado: platform_metrics_backup_traditional';
    END IF;
END $$;

-- =====================================================
-- NOVA TABELA PLATFORM_METRICS - 3 CAMPOS JSON
-- =====================================================

-- Drop e recriar com estrutura JSON
DROP TABLE IF EXISTS platform_metrics CASCADE;

CREATE TABLE platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- METADATA BÁSICOS
    calculation_date DATE NOT NULL,
    period VARCHAR(10) NOT NULL, -- '7d', '30d', '90d'
    data_source VARCHAR(50) DEFAULT 'tenant_aggregation',
    
    -- =====================================================
    -- 3 CAMPOS JSON PRINCIPAIS
    -- =====================================================
    
    -- MÉTRICAS OPERACIONAIS E FINANCEIRAS CONSOLIDADAS
    comprehensive_metrics JSONB DEFAULT '{}'::JSONB,
    
    -- MÉTRICAS DE PARTICIPAÇÃO E DISTORÇÃO DA PLATAFORMA  
    participation_metrics JSONB DEFAULT '{}'::JSONB,
    
    -- MÉTRICAS DE RANKING E PERFORMANCE COMPARATIVA
    ranking_metrics JSONB DEFAULT '{}'::JSONB,
    
    -- TIMESTAMPS
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- CONSTRAINTS
    CONSTRAINT platform_metrics_period_check CHECK (period IN ('7d', '30d', '90d'))
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

-- Índices GIN para busca em JSON
CREATE INDEX idx_platform_metrics_comprehensive_gin 
ON platform_metrics USING GIN (comprehensive_metrics);

CREATE INDEX idx_platform_metrics_participation_gin 
ON platform_metrics USING GIN (participation_metrics);

CREATE INDEX idx_platform_metrics_ranking_gin 
ON platform_metrics USING GIN (ranking_metrics);

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
-- FUNÇÃO DE AGREGAÇÃO REFATORADA - JSON
-- =====================================================
CREATE OR REPLACE FUNCTION aggregate_platform_metrics_json(
    target_date DATE DEFAULT CURRENT_DATE,
    target_period VARCHAR(10) DEFAULT '30d'
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    tenants_count INTEGER;
    processed_count INTEGER;
    comprehensive_data JSONB;
    participation_data JSONB;
    ranking_data JSONB;
    platform_mrr_total DECIMAL;
    total_revenue_sum DECIMAL;
    active_tenants_count INTEGER;
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
    AND comprehensive_metrics IS NOT NULL
    AND comprehensive_metrics != '{}'::JSONB
    AND DATE(calculated_at) = target_date;
    
    -- =====================================================
    -- CALCULAR COMPREHENSIVE METRICS
    -- =====================================================
    
    -- MRR da Plataforma
    SELECT COALESCE(SUM((comprehensive_metrics->>'custo_total_plataforma')::DECIMAL), 0)
    INTO platform_mrr_total
    FROM tenant_metrics
    WHERE period = target_period
    AND comprehensive_metrics IS NOT NULL
    AND comprehensive_metrics->>'custo_total_plataforma' IS NOT NULL
    AND DATE(calculated_at) = target_date;
    
    -- Receita Total
    SELECT COALESCE(SUM((comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL), 0)
    INTO total_revenue_sum
    FROM tenant_metrics
    WHERE period = target_period
    AND comprehensive_metrics IS NOT NULL
    AND comprehensive_metrics->>'monthly_revenue_brl' IS NOT NULL
    AND DATE(calculated_at) = target_date;
    
    -- Tenants Ativos
    SELECT COUNT(DISTINCT tenant_id)
    INTO active_tenants_count
    FROM tenant_metrics
    WHERE period = target_period
    AND comprehensive_metrics IS NOT NULL
    AND (comprehensive_metrics->>'total_appointments')::INTEGER > 0
    AND DATE(calculated_at) = target_date;
    
    -- Montar JSON comprehensive_metrics
    comprehensive_data := jsonb_build_object(
        -- FINANCEIRO
        'platform_mrr', platform_mrr_total,
        'total_revenue', total_revenue_sum,
        'revenue_platform_ratio', CASE 
            WHEN platform_mrr_total > 0 THEN total_revenue_sum / platform_mrr_total 
            ELSE 0 
        END,
        'avg_revenue_per_tenant', CASE 
            WHEN active_tenants_count > 0 THEN total_revenue_sum / active_tenants_count 
            ELSE 0 
        END,
        
        -- OPERACIONAL
        'active_tenants', active_tenants_count,
        'total_tenants_processed', processed_count,
        'total_appointments', (
            SELECT COALESCE(SUM((comprehensive_metrics->>'total_appointments')::INTEGER), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND DATE(calculated_at) = target_date
        ),
        'total_chat_minutes', (
            SELECT COALESCE(SUM((comprehensive_metrics->>'total_chat_minutes')::DECIMAL), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND DATE(calculated_at) = target_date
        ),
        'total_new_customers', (
            SELECT COALESCE(SUM((comprehensive_metrics->>'new_customers_count')::INTEGER), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND DATE(calculated_at) = target_date
        ),
        'total_professionals', (
            SELECT COALESCE(SUM((comprehensive_metrics->>'professionals_count')::INTEGER), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND DATE(calculated_at) = target_date
        ),
        'total_services', (
            SELECT COALESCE(SUM((comprehensive_metrics->>'services_count')::INTEGER), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND DATE(calculated_at) = target_date
        ),
        
        -- QUALIDADE E PERFORMANCE (médias ponderadas)
        'avg_appointment_success_rate', (
            SELECT COALESCE(AVG((comprehensive_metrics->>'appointment_success_rate')::DECIMAL), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND (comprehensive_metrics->>'appointment_success_rate')::DECIMAL > 0
            AND DATE(calculated_at) = target_date
        ),
        'avg_customer_satisfaction_score', (
            SELECT COALESCE(AVG((comprehensive_metrics->>'customer_satisfaction_score')::DECIMAL), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND (comprehensive_metrics->>'customer_satisfaction_score')::DECIMAL > 0
            AND DATE(calculated_at) = target_date
        ),
        'avg_ai_assistant_efficiency', (
            SELECT COALESCE(AVG((comprehensive_metrics->>'ai_assistant_efficiency')::DECIMAL), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND (comprehensive_metrics->>'ai_assistant_efficiency')::DECIMAL > 0
            AND DATE(calculated_at) = target_date
        ),
        'avg_spam_rate_pct', (
            SELECT COALESCE(AVG((comprehensive_metrics->>'spam_rate_pct')::DECIMAL), 0)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND (comprehensive_metrics->>'spam_rate_pct')::DECIMAL >= 0
            AND DATE(calculated_at) = target_date
        )
    );
    
    -- =====================================================
    -- CALCULAR PARTICIPATION METRICS
    -- =====================================================
    
    participation_data := jsonb_build_object(
        -- DISTRIBUIÇÃO DE RECEITA
        'revenue_distribution', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'tenant_id', tenant_id,
                    'revenue_brl', (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL,
                    'revenue_percentage', CASE 
                        WHEN total_revenue_sum > 0 
                        THEN ROUND(((comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL / total_revenue_sum * 100), 2) 
                        ELSE 0 
                    END,
                    'appointment_count', (comprehensive_metrics->>'total_appointments')::INTEGER,
                    'customer_count', (comprehensive_metrics->>'new_customers_count')::INTEGER
                )
            )
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL > 0
            AND DATE(calculated_at) = target_date
            ORDER BY (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL DESC
        ),
        
        -- ESTATÍSTICAS DE DISTORÇÃO
        'revenue_concentration_top_3', (
            SELECT COALESCE(
                SUM((comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL) / 
                NULLIF(total_revenue_sum, 0) * 100, 0
            )
            FROM (
                SELECT comprehensive_metrics
                FROM tenant_metrics
                WHERE period = target_period
                AND comprehensive_metrics IS NOT NULL
                AND (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL > 0
                AND DATE(calculated_at) = target_date
                ORDER BY (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL DESC
                LIMIT 3
            ) top_tenants
        ),
        
        -- TENANTS ACIMA/ABAIXO DA MÉDIA
        'tenants_above_avg_usage', (
            WITH avg_usage AS (
                SELECT AVG((comprehensive_metrics->>'total_appointments')::INTEGER) as avg_appointments
                FROM tenant_metrics
                WHERE period = target_period
                AND comprehensive_metrics IS NOT NULL
                AND DATE(calculated_at) = target_date
            )
            SELECT COUNT(*)
            FROM tenant_metrics tm, avg_usage au
            WHERE tm.period = target_period
            AND tm.comprehensive_metrics IS NOT NULL
            AND (tm.comprehensive_metrics->>'total_appointments')::INTEGER > au.avg_appointments
            AND DATE(tm.calculated_at) = target_date
        ),
        
        'tenants_below_avg_usage', (
            WITH avg_usage AS (
                SELECT AVG((comprehensive_metrics->>'total_appointments')::INTEGER) as avg_appointments
                FROM tenant_metrics
                WHERE period = target_period
                AND comprehensive_metrics IS NOT NULL
                AND DATE(calculated_at) = target_date
            )
            SELECT COUNT(*)
            FROM tenant_metrics tm, avg_usage au
            WHERE tm.period = target_period
            AND tm.comprehensive_metrics IS NOT NULL
            AND (tm.comprehensive_metrics->>'total_appointments')::INTEGER <= au.avg_appointments
            AND DATE(tm.calculated_at) = target_date
        )
    );
    
    -- =====================================================
    -- CALCULAR RANKING METRICS
    -- =====================================================
    
    ranking_data := jsonb_build_object(
        -- TOP PERFORMERS
        'top_revenue_tenants', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rank', row_number() OVER (ORDER BY (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL DESC),
                    'tenant_id', tenant_id,
                    'tenant_name', COALESCE(tenant_name, 'Unknown'),
                    'revenue_brl', (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL,
                    'appointments', (comprehensive_metrics->>'total_appointments')::INTEGER,
                    'success_rate', (comprehensive_metrics->>'appointment_success_rate')::DECIMAL
                )
            )
            FROM (
                SELECT *
                FROM tenant_metrics
                WHERE period = target_period
                AND comprehensive_metrics IS NOT NULL
                AND (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL > 0
                AND DATE(calculated_at) = target_date
                ORDER BY (comprehensive_metrics->>'monthly_revenue_brl')::DECIMAL DESC
                LIMIT 10
            ) ranked_tenants
        ),
        
        -- PERFORMANCE SCORES
        'platform_health_score', (
            SELECT ROUND(AVG(
                (comprehensive_metrics->>'appointment_success_rate')::DECIMAL * 0.3 +
                (comprehensive_metrics->>'customer_satisfaction_score')::DECIMAL * 0.25 +
                (comprehensive_metrics->>'ai_assistant_efficiency')::DECIMAL * 0.25 +
                ((100 - (comprehensive_metrics->>'spam_rate_pct')::DECIMAL) * 0.2)
            ), 2)
            FROM tenant_metrics
            WHERE period = target_period
            AND comprehensive_metrics IS NOT NULL
            AND DATE(calculated_at) = target_date
        ),
        
        -- OPERATIONAL EFFICIENCY
        'operational_efficiency_pct', (
            WITH efficiency_metrics AS (
                SELECT 
                    CASE 
                        WHEN (comprehensive_metrics->>'total_chat_minutes')::DECIMAL > 0 
                        THEN (comprehensive_metrics->>'total_appointments')::INTEGER / 
                             ((comprehensive_metrics->>'total_chat_minutes')::DECIMAL / 60.0)
                        ELSE 0 
                    END as appointments_per_hour
                FROM tenant_metrics
                WHERE period = target_period
                AND comprehensive_metrics IS NOT NULL
                AND DATE(calculated_at) = target_date
            )
            SELECT ROUND(AVG(appointments_per_hour) * 10, 2) -- Scale to percentage
            FROM efficiency_metrics
        )
    );
    
    -- =====================================================
    -- INSERIR REGISTRO AGREGADO
    -- =====================================================
    
    INSERT INTO platform_metrics (
        calculation_date,
        period,
        data_source,
        comprehensive_metrics,
        participation_metrics,
        ranking_metrics
    ) VALUES (
        target_date,
        target_period,
        'tenant_aggregation_json',
        comprehensive_data,
        participation_data,
        ranking_data
    );
    
    -- Retornar resultado
    SELECT jsonb_build_object(
        'success', true,
        'calculation_date', target_date,
        'period', target_period,
        'tenants_processed', processed_count,
        'total_tenants', tenants_count,
        'platform_mrr', platform_mrr_total,
        'total_revenue', total_revenue_sum,
        'active_tenants', active_tenants_count,
        'message', format('Platform metrics agregados (JSON) para %s tenants no período %s', processed_count, target_period)
    ) INTO result;
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', 'Erro ao agregar platform metrics (JSON)'
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO DE MIGRAÇÃO DOS DADOS EXISTENTES
-- =====================================================
CREATE OR REPLACE FUNCTION migrate_platform_metrics_to_json() RETURNS JSONB AS $$
DECLARE
    migrated_count INTEGER := 0;
    record_count INTEGER;
BEGIN
    -- Contar registros na tabela backup
    SELECT COUNT(*) INTO record_count 
    FROM platform_metrics_backup_traditional;
    
    -- Migrar dados existentes se houver backup
    IF record_count > 0 THEN
        INSERT INTO platform_metrics (
            calculation_date,
            period,
            data_source,
            comprehensive_metrics,
            participation_metrics,
            ranking_metrics,
            created_at,
            updated_at
        )
        SELECT 
            calculation_date,
            CASE period_days 
                WHEN 7 THEN '7d'
                WHEN 30 THEN '30d' 
                WHEN 90 THEN '90d'
                ELSE '30d'
            END as period,
            COALESCE(data_source, 'legacy_migration'),
            
            -- Comprehensive metrics do backup
            jsonb_build_object(
                'platform_mrr', COALESCE(platform_mrr, 0),
                'total_revenue', COALESCE(total_revenue, 0),
                'revenue_platform_ratio', COALESCE(receita_uso_ratio, 0),
                'active_tenants', COALESCE(active_tenants, 0),
                'total_appointments', COALESCE(total_appointments, 0),
                'total_chat_minutes', COALESCE(total_chat_minutes, 0),
                'total_new_customers', COALESCE(total_customers, 0),
                'total_conversations', COALESCE(total_conversations, 0),
                'avg_appointment_success_rate', 90.0, -- Default estimate
                'avg_spam_rate_pct', COALESCE(spam_rate_pct, 0),
                'operational_efficiency_pct', COALESCE(operational_efficiency_pct, 0)
            ),
            
            -- Participation metrics básicos
            jsonb_build_object(
                'tenants_above_usage', COALESCE(tenants_above_usage, 0),
                'tenants_below_usage', COALESCE(tenants_below_usage, 0),
                'revenue_usage_distortion_index', COALESCE(revenue_usage_distortion_index, 0)
            ),
            
            -- Ranking metrics básicos
            jsonb_build_object(
                'platform_health_score', COALESCE(platform_health_score, 75.0),
                'cancellation_rate_pct', COALESCE(cancellation_rate_pct, 0)
            ),
            
            created_at,
            updated_at
        FROM platform_metrics_backup_traditional;
        
        GET DIAGNOSTICS migrated_count = ROW_COUNT;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'migrated_records', migrated_count,
        'backup_records', record_count,
        'message', format('Migrated %s records from traditional to JSON structure', migrated_count)
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', 'Erro na migração dos dados'
    );
END;
$$ LANGUAGE plpgsql;

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
-- COMENTÁRIOS DA TABELA
-- =====================================================
COMMENT ON TABLE platform_metrics IS 'Métricas agregadas da plataforma - estrutura JSON com 3 campos principais';

COMMENT ON COLUMN platform_metrics.comprehensive_metrics IS 'Métricas operacionais e financeiras consolidadas (JSON)';
COMMENT ON COLUMN platform_metrics.participation_metrics IS 'Métricas de participação e distorção da plataforma (JSON)';
COMMENT ON COLUMN platform_metrics.ranking_metrics IS 'Métricas de ranking e performance comparativa (JSON)';

-- =====================================================
-- SUCESSO
-- =====================================================
SELECT 'Schema platform_metrics refatorado para JSON com 3 campos! ✅' as status;