-- =====================================================
-- CONSOLIDAÇÃO DO SISTEMA TENANT/PLATFORM
-- Limpa duplicações, padroniza e otimiza sistema existente
-- =====================================================

-- Executar com cuidado em produção!
-- Recomenda-se backup antes da execução

BEGIN;

-- =====================================================
-- 1. LIMPEZA DE TABELAS DUPLICADAS/DESNECESSÁRIAS
-- =====================================================

-- Verificar se tabelas conflitantes existem e consolidar
DO $$
DECLARE
    has_tenant_metrics boolean;
    has_platform_metrics boolean;
BEGIN
    -- Verificar existência de tabelas conflitantes
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tenant_metrics'
    ) INTO has_tenant_metrics;
    
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tenant_platform_metrics'
    ) INTO has_platform_metrics;
    
    RAISE NOTICE 'Tabela tenant_metrics existe: %', has_tenant_metrics;
    RAISE NOTICE 'Tabela tenant_platform_metrics existe: %', has_platform_metrics;
    
    -- Se ambas existem, migrar dados importantes de tenant_metrics para tenant_platform_metrics
    IF has_tenant_metrics AND has_platform_metrics THEN
        RAISE NOTICE 'Migrando dados importantes de tenant_metrics para tenant_platform_metrics...';
        
        -- Inserir métricas que não existem em tenant_platform_metrics
        INSERT INTO tenant_platform_metrics (
            tenant_id, 
            metric_date, 
            revenue_participation_value,
            tenant_appointments_count,
            tenant_customers_count,
            calculation_period_days,
            created_at
        )
        SELECT DISTINCT
            tm.tenant_id,
            COALESCE(tm.metric_date, CURRENT_DATE) as metric_date,
            COALESCE((tm.metric_value->>'revenue')::decimal, 0) as revenue_participation_value,
            COALESCE((tm.metric_value->>'appointments')::integer, 0) as tenant_appointments_count,
            COALESCE((tm.metric_value->>'customers')::integer, 0) as tenant_customers_count,
            COALESCE(tm.period_days, 30) as calculation_period_days,
            tm.created_at
        FROM tenant_metrics tm
        WHERE NOT EXISTS (
            SELECT 1 FROM tenant_platform_metrics tpm 
            WHERE tpm.tenant_id = tm.tenant_id 
            AND tpm.metric_date = COALESCE(tm.metric_date, CURRENT_DATE)
        )
        AND tm.metric_value IS NOT NULL;
        
        RAISE NOTICE 'Migração concluída. Removendo tabela tenant_metrics...';
        
        -- Remover tabela duplicada após migração
        DROP TABLE IF EXISTS tenant_metrics CASCADE;
        
    ELSIF has_tenant_metrics AND NOT has_platform_metrics THEN
        RAISE NOTICE 'Apenas tenant_metrics existe. Mantendo estrutura atual.';
    END IF;
END $$;

-- =====================================================
-- 2. GARANTIR ESTRUTURA OTIMIZADA DA TABELA PRINCIPAL
-- =====================================================

-- Verificar e criar/ajustar tenant_platform_metrics se necessário
CREATE TABLE IF NOT EXISTS tenant_platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Revenue Metrics (Fonte: subscription_payments)
    revenue_participation_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (revenue_participation_pct >= 0 AND revenue_participation_pct <= 100),
    revenue_participation_value DECIMAL(12,2) NOT NULL DEFAULT 0.00 CHECK (revenue_participation_value >= 0),
    platform_total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0.00 CHECK (platform_total_revenue >= 0),
    
    -- Appointments Metrics (Fonte: appointments)
    appointments_participation_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (appointments_participation_pct >= 0 AND appointments_participation_pct <= 100),
    tenant_appointments_count INTEGER NOT NULL DEFAULT 0 CHECK (tenant_appointments_count >= 0),
    platform_total_appointments INTEGER NOT NULL DEFAULT 0 CHECK (platform_total_appointments >= 0),
    
    -- Customers Metrics (Fonte: users via appointments)
    customers_participation_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (customers_participation_pct >= 0 AND customers_participation_pct <= 100),
    tenant_customers_count INTEGER NOT NULL DEFAULT 0 CHECK (tenant_customers_count >= 0),
    platform_total_customers INTEGER NOT NULL DEFAULT 0 CHECK (platform_total_customers >= 0),
    
    -- AI Metrics (Fonte: conversation_history)
    ai_participation_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (ai_participation_pct >= 0 AND ai_participation_pct <= 100),
    tenant_ai_interactions INTEGER NOT NULL DEFAULT 0 CHECK (tenant_ai_interactions >= 0),
    platform_total_ai_interactions INTEGER NOT NULL DEFAULT 0 CHECK (platform_total_ai_interactions >= 0),
    
    -- Operational Metrics
    cancellation_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (cancellation_rate_pct >= 0 AND cancellation_rate_pct <= 100),
    cancelled_appointments_count INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_appointments_count >= 0),
    rescheduling_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (rescheduling_rate_pct >= 0 AND rescheduling_rate_pct <= 100),
    rescheduled_appointments_count INTEGER NOT NULL DEFAULT 0 CHECK (rescheduled_appointments_count >= 0),
    
    -- Ranking Metrics
    ranking_position INTEGER NOT NULL DEFAULT 0 CHECK (ranking_position >= 0),
    total_tenants_in_ranking INTEGER NOT NULL DEFAULT 0 CHECK (total_tenants_in_ranking >= 0),
    ranking_percentile DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (ranking_percentile >= 0 AND ranking_percentile <= 100),
    ranking_category VARCHAR(20) NOT NULL DEFAULT 'Unranked',
    
    -- Business Intelligence
    risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_status VARCHAR(20) NOT NULL DEFAULT 'Unknown',
    efficiency_score DECIMAL(8,2) NOT NULL DEFAULT 0.00 CHECK (efficiency_score >= 0),
    avg_chat_time_minutes DECIMAL(6,2) NOT NULL DEFAULT 0.00 CHECK (avg_chat_time_minutes >= 0),
    phone_quality_score DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (phone_quality_score >= 0 AND phone_quality_score <= 100),
    conversion_rate_pct DECIMAL(8,2) NOT NULL DEFAULT 0.00 CHECK (conversion_rate_pct >= 0),
    
    -- Metadata
    calculation_period_days INTEGER NOT NULL DEFAULT 30 CHECK (calculation_period_days > 0),
    data_source VARCHAR(50) NOT NULL DEFAULT 'consolidated',
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, metric_date, calculation_period_days)
);

-- =====================================================
-- 3. ÍNDICES OTIMIZADOS PARA PERFORMANCE
-- =====================================================

-- Remover índices antigos que podem conflitar
DROP INDEX IF EXISTS idx_tenant_platform_metrics_tenant_id;
DROP INDEX IF EXISTS idx_tenant_platform_metrics_date;
DROP INDEX IF EXISTS idx_tenant_platform_metrics_ranking;

-- Criar índices otimizados
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_tenant_date ON tenant_platform_metrics(tenant_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_ranking_position ON tenant_platform_metrics(ranking_position) WHERE ranking_position > 0;
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_revenue_desc ON tenant_platform_metrics(revenue_participation_value DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_calculated_at ON tenant_platform_metrics(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_period_date ON tenant_platform_metrics(calculation_period_days, metric_date DESC);

-- =====================================================
-- 4. TABELA DE AGREGADOS DA PLATAFORMA (CONSOLIDADA)
-- =====================================================

CREATE TABLE IF NOT EXISTS platform_daily_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_date DATE NOT NULL DEFAULT CURRENT_DATE,
    calculation_period_days INTEGER NOT NULL DEFAULT 30,
    
    -- Platform Totals
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0.00 CHECK (total_revenue >= 0),
    total_appointments INTEGER NOT NULL DEFAULT 0 CHECK (total_appointments >= 0),
    total_customers INTEGER NOT NULL DEFAULT 0 CHECK (total_customers >= 0),
    total_ai_interactions INTEGER NOT NULL DEFAULT 0 CHECK (total_ai_interactions >= 0),
    total_active_tenants INTEGER NOT NULL DEFAULT 0 CHECK (total_active_tenants >= 0),
    
    -- Platform Averages
    avg_appointments_per_tenant DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    avg_revenue_per_tenant DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    avg_customers_per_tenant DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    
    -- Platform Health
    platform_growth_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    active_tenants_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    
    -- Data Quality
    data_completeness_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    last_calculation_duration_ms INTEGER DEFAULT 0,
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(aggregate_date, calculation_period_days)
);

-- Índices para platform_daily_aggregates
CREATE INDEX IF NOT EXISTS idx_platform_aggregates_date_period ON platform_daily_aggregates(aggregate_date DESC, calculation_period_days);

-- =====================================================
-- 5. LIMPEZA DE FUNÇÕES DUPLICADAS/OBSOLETAS
-- =====================================================

-- Listar e remover funções obsoletas com sufixos como _fixed, _backup, _old
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Buscar funções com sufixos de versionamento
    FOR func_record IN 
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_type = 'FUNCTION' 
        AND routine_schema = 'public'
        AND (
            routine_name LIKE '%_fixed' OR 
            routine_name LIKE '%_backup' OR 
            routine_name LIKE '%_old' OR 
            routine_name LIKE '%_temp' OR
            routine_name LIKE '%_test'
        )
    LOOP
        RAISE NOTICE 'Removendo função obsoleta: %', func_record.routine_name;
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.routine_name || ' CASCADE';
    END LOOP;
END $$;

-- =====================================================
-- 6. FUNÇÃO PRINCIPAL CONSOLIDADA DE CÁLCULO
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenant_platform_metrics_consolidated(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30,
    p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE (
    processed_tenants INTEGER,
    total_revenue DECIMAL(12,2),
    total_appointments INTEGER,
    execution_time_ms INTEGER,
    success BOOLEAN
) 
LANGUAGE plpgsql
AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    period_start_date DATE;
    platform_totals RECORD;
    tenant_count INTEGER := 0;
    processed_count INTEGER := 0;
BEGIN
    start_time := clock_timestamp();
    period_start_date := p_calculation_date - (p_period_days || ' days')::INTERVAL;
    
    RAISE NOTICE 'Iniciando cálculo consolidado: data=%, período=%d dias, tenant=%', 
                 p_calculation_date, p_period_days, COALESCE(p_tenant_id::text, 'ALL');
    
    -- 1. Calcular totais da plataforma primeiro
    SELECT 
        COALESCE(SUM(sp.payment_amount), 0) as total_revenue,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT a.user_id) as total_customers,
        COUNT(DISTINCT ch.id) as total_ai_interactions,
        COUNT(DISTINCT t.id) as total_active_tenants
    INTO platform_totals
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_date >= period_start_date 
        AND sp.payment_date <= p_calculation_date
        AND sp.status = 'completed'
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= period_start_date::timestamp 
        AND a.created_at <= (p_calculation_date + INTERVAL '1 day')
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= period_start_date::timestamp 
        AND ch.created_at <= (p_calculation_date + INTERVAL '1 day')
        AND ch.ended_at IS NOT NULL
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id);
    
    -- 2. Atualizar/inserir agregados da plataforma
    INSERT INTO platform_daily_aggregates (
        aggregate_date, calculation_period_days,
        total_revenue, total_appointments, total_customers, 
        total_ai_interactions, total_active_tenants,
        avg_revenue_per_tenant, avg_appointments_per_tenant, avg_customers_per_tenant
    ) VALUES (
        p_calculation_date, p_period_days,
        platform_totals.total_revenue, platform_totals.total_appointments, 
        platform_totals.total_customers, platform_totals.total_ai_interactions, 
        platform_totals.total_active_tenants,
        CASE WHEN platform_totals.total_active_tenants > 0 
             THEN platform_totals.total_revenue / platform_totals.total_active_tenants 
             ELSE 0 END,
        CASE WHEN platform_totals.total_active_tenants > 0 
             THEN platform_totals.total_appointments::decimal / platform_totals.total_active_tenants 
             ELSE 0 END,
        CASE WHEN platform_totals.total_active_tenants > 0 
             THEN platform_totals.total_customers::decimal / platform_totals.total_active_tenants 
             ELSE 0 END
    ) ON CONFLICT (aggregate_date, calculation_period_days) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_appointments = EXCLUDED.total_appointments,
        total_customers = EXCLUDED.total_customers,
        total_ai_interactions = EXCLUDED.total_ai_interactions,
        total_active_tenants = EXCLUDED.total_active_tenants,
        avg_revenue_per_tenant = EXCLUDED.avg_revenue_per_tenant,
        avg_appointments_per_tenant = EXCLUDED.avg_appointments_per_tenant,
        avg_customers_per_tenant = EXCLUDED.avg_customers_per_tenant,
        calculated_at = NOW();
    
    -- 3. Processar métricas por tenant
    FOR tenant_count IN
        SELECT COUNT(*) FROM tenants WHERE (p_tenant_id IS NULL OR id = p_tenant_id)
    LOOP
        EXIT; -- Just to get the count
    END LOOP;
    
    -- Inserir/atualizar métricas de tenants
    INSERT INTO tenant_platform_metrics (
        tenant_id, metric_date, calculation_period_days,
        revenue_participation_value, revenue_participation_pct, platform_total_revenue,
        tenant_appointments_count, appointments_participation_pct, platform_total_appointments,
        tenant_customers_count, customers_participation_pct, platform_total_customers,
        tenant_ai_interactions, ai_participation_pct, platform_total_ai_interactions,
        cancellation_rate_pct, cancelled_appointments_count,
        rescheduling_rate_pct, rescheduled_appointments_count,
        risk_score, risk_status, efficiency_score, conversion_rate_pct
    )
    SELECT 
        t.id as tenant_id,
        p_calculation_date as metric_date,
        p_period_days as calculation_period_days,
        
        -- Revenue
        COALESCE(SUM(sp.payment_amount), 0) as revenue_participation_value,
        CASE WHEN platform_totals.total_revenue > 0 
             THEN (COALESCE(SUM(sp.payment_amount), 0) / platform_totals.total_revenue * 100)::decimal(5,2)
             ELSE 0 END as revenue_participation_pct,
        platform_totals.total_revenue,
        
        -- Appointments
        COUNT(DISTINCT a.id) as tenant_appointments_count,
        CASE WHEN platform_totals.total_appointments > 0 
             THEN (COUNT(DISTINCT a.id)::decimal / platform_totals.total_appointments * 100)::decimal(5,2)
             ELSE 0 END as appointments_participation_pct,
        platform_totals.total_appointments,
        
        -- Customers
        COUNT(DISTINCT a.user_id) as tenant_customers_count,
        CASE WHEN platform_totals.total_customers > 0 
             THEN (COUNT(DISTINCT a.user_id)::decimal / platform_totals.total_customers * 100)::decimal(5,2)
             ELSE 0 END as customers_participation_pct,
        platform_totals.total_customers,
        
        -- AI Interactions
        COUNT(DISTINCT ch.id) as tenant_ai_interactions,
        CASE WHEN platform_totals.total_ai_interactions > 0 
             THEN (COUNT(DISTINCT ch.id)::decimal / platform_totals.total_ai_interactions * 100)::decimal(5,2)
             ELSE 0 END as ai_participation_pct,
        platform_totals.total_ai_interactions,
        
        -- Cancellations
        CASE WHEN COUNT(DISTINCT a.id) > 0 
             THEN (COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / COUNT(DISTINCT a.id) * 100)::decimal(5,2)
             ELSE 0 END as cancellation_rate_pct,
        COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END) as cancelled_appointments_count,
        
        -- Rescheduling
        CASE WHEN COUNT(DISTINCT a.id) > 0 
             THEN (COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END)::decimal / COUNT(DISTINCT a.id) * 100)::decimal(5,2)
             ELSE 0 END as rescheduling_rate_pct,
        COUNT(DISTINCT CASE WHEN a.status = 'rescheduled' THEN a.id END) as rescheduled_appointments_count,
        
        -- Risk Score (simplified)
        CASE 
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.payment_amount), 0) > 0 THEN 25 -- Paying but inactive
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.payment_amount), 0) = 0 THEN 85 -- No activity
            WHEN COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / GREATEST(COUNT(DISTINCT a.id), 1) > 0.3 THEN 70 -- High cancellation
            ELSE 15 -- Normal
        END as risk_score,
        
        -- Risk Status
        CASE 
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.payment_amount), 0) > 0 THEN 'Low Risk'
            WHEN COUNT(DISTINCT a.id) = 0 AND COALESCE(SUM(sp.payment_amount), 0) = 0 THEN 'High Risk'
            WHEN COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::decimal / GREATEST(COUNT(DISTINCT a.id), 1) > 0.3 THEN 'Medium Risk'
            ELSE 'Low Risk'
        END as risk_status,
        
        -- Efficiency Score
        CASE WHEN COUNT(DISTINCT a.user_id) > 0 AND platform_totals.total_customers > 0
             THEN ((COALESCE(SUM(sp.payment_amount), 0) / platform_totals.total_revenue * 100) / 
                   (COUNT(DISTINCT a.user_id)::decimal / platform_totals.total_customers * 100) * 100)::decimal(8,2)
             ELSE 0 END as efficiency_score,
        
        -- Conversion Rate
        CASE WHEN COUNT(DISTINCT ch.id) > 0 
             THEN (COUNT(DISTINCT a.id)::decimal / COUNT(DISTINCT ch.id) * 100)::decimal(8,2)
             ELSE 0 END as conversion_rate_pct
             
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_date >= period_start_date 
        AND sp.payment_date <= p_calculation_date
        AND sp.status = 'completed'
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= period_start_date::timestamp 
        AND a.created_at <= (p_calculation_date + INTERVAL '1 day')
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= period_start_date::timestamp 
        AND ch.created_at <= (p_calculation_date + INTERVAL '1 day')
        AND ch.ended_at IS NOT NULL
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
    GROUP BY t.id
    
    ON CONFLICT (tenant_id, metric_date, calculation_period_days) DO UPDATE SET
        revenue_participation_value = EXCLUDED.revenue_participation_value,
        revenue_participation_pct = EXCLUDED.revenue_participation_pct,
        platform_total_revenue = EXCLUDED.platform_total_revenue,
        tenant_appointments_count = EXCLUDED.tenant_appointments_count,
        appointments_participation_pct = EXCLUDED.appointments_participation_pct,
        platform_total_appointments = EXCLUDED.platform_total_appointments,
        tenant_customers_count = EXCLUDED.tenant_customers_count,
        customers_participation_pct = EXCLUDED.customers_participation_pct,
        platform_total_customers = EXCLUDED.platform_total_customers,
        tenant_ai_interactions = EXCLUDED.tenant_ai_interactions,
        ai_participation_pct = EXCLUDED.ai_participation_pct,
        platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
        cancellation_rate_pct = EXCLUDED.cancellation_rate_pct,
        cancelled_appointments_count = EXCLUDED.cancelled_appointments_count,
        rescheduling_rate_pct = EXCLUDED.rescheduling_rate_pct,
        rescheduled_appointments_count = EXCLUDED.rescheduled_appointments_count,
        risk_score = EXCLUDED.risk_score,
        risk_status = EXCLUDED.risk_status,
        efficiency_score = EXCLUDED.efficiency_score,
        conversion_rate_pct = EXCLUDED.conversion_rate_pct,
        calculated_at = NOW(),
        updated_at = NOW();
    
    GET DIAGNOSTICS processed_count = ROW_COUNT;
    
    -- 4. Atualizar rankings
    PERFORM update_tenant_rankings_consolidated(p_calculation_date, p_period_days);
    
    end_time := clock_timestamp();
    
    RAISE NOTICE 'Cálculo consolidado concluído: % tenants processados em %ms', 
                 processed_count, EXTRACT(MILLISECONDS FROM (end_time - start_time));
    
    RETURN QUERY SELECT 
        processed_count,
        platform_totals.total_revenue,
        platform_totals.total_appointments,
        EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER,
        true;
END;
$$;

-- =====================================================
-- 7. FUNÇÃO DE RANKING CONSOLIDADA
-- =====================================================

CREATE OR REPLACE FUNCTION update_tenant_rankings_consolidated(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Atualizar rankings baseados na receita
    WITH ranked_tenants AS (
        SELECT 
            tenant_id,
            ROW_NUMBER() OVER (ORDER BY revenue_participation_value DESC, tenant_id) as new_position,
            COUNT(*) OVER () as total_tenants
        FROM tenant_platform_metrics 
        WHERE metric_date = p_calculation_date 
        AND calculation_period_days = p_period_days
    )
    UPDATE tenant_platform_metrics 
    SET 
        ranking_position = rt.new_position,
        total_tenants_in_ranking = rt.total_tenants,
        ranking_percentile = ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100)::decimal(5,2),
        ranking_category = CASE 
            WHEN ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100) >= 90 THEN 'Top 10%'
            WHEN ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100) >= 75 THEN 'Top 25%'
            WHEN ((rt.total_tenants - rt.new_position)::decimal / rt.total_tenants * 100) >= 50 THEN 'Top 50%'
            ELSE 'Other'
        END,
        updated_at = NOW()
    FROM ranked_tenants rt
    WHERE tenant_platform_metrics.tenant_id = rt.tenant_id 
    AND tenant_platform_metrics.metric_date = p_calculation_date
    AND tenant_platform_metrics.calculation_period_days = p_period_days;
    
    RAISE NOTICE 'Rankings atualizados para data % e período %d dias', p_calculation_date, p_period_days;
END;
$$;

-- =====================================================
-- 8. RLS POLICIES CONSOLIDADAS
-- =====================================================

-- Remover policies antigas se existirem
DROP POLICY IF EXISTS tenant_platform_metrics_isolation ON tenant_platform_metrics;
DROP POLICY IF EXISTS platform_aggregates_super_admin ON platform_daily_aggregates;

-- Recriar policies otimizadas
ALTER TABLE tenant_platform_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_daily_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_platform_metrics_access ON tenant_platform_metrics
    FOR ALL USING (
        -- Super admin tem acesso total
        auth.jwt() ->> 'role' = 'super_admin' 
        OR 
        -- Tenant admin só vê seus próprios dados
        (auth.jwt() ->> 'role' = 'tenant_admin' AND auth.jwt() ->> 'tenant_id' = tenant_id::text)
    );

CREATE POLICY platform_aggregates_access ON platform_daily_aggregates
    FOR ALL USING (
        -- Apenas super admin pode ver agregados da plataforma
        auth.jwt() ->> 'role' = 'super_admin'
    );

COMMIT;

-- =====================================================
-- 9. VERIFICAÇÃO E RELATÓRIO FINAL
-- =====================================================

DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Contar estruturas criadas
    SELECT COUNT(*) INTO table_count FROM information_schema.tables 
    WHERE table_name IN ('tenant_platform_metrics', 'platform_daily_aggregates');
    
    SELECT COUNT(*) INTO function_count FROM information_schema.routines 
    WHERE routine_name LIKE '%consolidated%' AND routine_type = 'FUNCTION';
    
    SELECT COUNT(*) INTO index_count FROM pg_indexes 
    WHERE tablename IN ('tenant_platform_metrics', 'platform_daily_aggregates');
    
    RAISE NOTICE '';
    RAISE NOTICE '🎉 CONSOLIDAÇÃO CONCLUÍDA COM SUCESSO!';
    RAISE NOTICE '================================';
    RAISE NOTICE 'Tabelas principais: % de 2', table_count;
    RAISE NOTICE 'Funções consolidadas: %', function_count;
    RAISE NOTICE 'Índices otimizados: %', index_count;
    RAISE NOTICE '';
    RAISE NOTICE '✅ Sistema Tenant/Platform consolidado e otimizado!';
    RAISE NOTICE '📊 Execute: SELECT * FROM calculate_tenant_platform_metrics_consolidated();';
    RAISE NOTICE '';
END $$;