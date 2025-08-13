-- =====================================================
-- NOVA ESTRUTURA DE MÉTRICAS - SEM REDUNDÂNCIA
-- =====================================================
-- Separa métricas de tenant das métricas de plataforma
-- Elimina redundância e simplifica APIs
-- =====================================================

-- =====================================================
-- TABELA: TENANT_METRICS
-- =====================================================
-- Armazena métricas individuais de cada tenant por período

CREATE TABLE IF NOT EXISTS tenant_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    period_days INTEGER NOT NULL CHECK (period_days IN (7, 30, 90)),
    data_source VARCHAR(50) NOT NULL DEFAULT 'new_metrics_function',
    
    -- Métricas básicas do tenant
    revenue_value DECIMAL(12,2) DEFAULT 0,
    appointments_count INTEGER DEFAULT 0,
    appointments_confirmed INTEGER DEFAULT 0,
    appointments_cancelled INTEGER DEFAULT 0,
    appointments_rescheduled INTEGER DEFAULT 0,
    customers_count INTEGER DEFAULT 0,
    ai_interactions INTEGER DEFAULT 0,
    
    -- Métricas de chat e engagement
    total_conversations INTEGER DEFAULT 0,
    valid_conversations INTEGER DEFAULT 0,
    spam_conversations INTEGER DEFAULT 0,
    total_chat_minutes INTEGER DEFAULT 0,
    avg_chat_duration_minutes DECIMAL(8,2) DEFAULT 0,
    
    -- Métricas calculadas e scores
    spam_detection_score DECIMAL(5,2) DEFAULT 0,
    revenue_per_chat_minute DECIMAL(10,2) DEFAULT 0,
    conversation_to_appointment_rate_pct DECIMAL(5,2) DEFAULT 0,
    efficiency_score DECIMAL(8,2) DEFAULT 0,
    
    -- Classificação e análise
    risk_level VARCHAR(10) DEFAULT 'Médio' CHECK (risk_level IN ('Baixo', 'Médio', 'Alto')),
    business_intelligence_score DECIMAL(5,2) DEFAULT 0,
    
    -- Participação na plataforma (calculado)
    revenue_participation_pct DECIMAL(5,2) DEFAULT 0,
    appointments_participation_pct DECIMAL(5,2) DEFAULT 0,
    customers_participation_pct DECIMAL(5,2) DEFAULT 0,
    ai_interactions_participation_pct DECIMAL(5,2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint para evitar duplicatas
    UNIQUE(tenant_id, calculation_date, period_days, data_source)
);

-- =====================================================
-- TABELA: PLATFORM_METRICS  
-- =====================================================
-- Armazena métricas agregadas de toda a plataforma por período

CREATE TABLE IF NOT EXISTS platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    period_days INTEGER NOT NULL CHECK (period_days IN (7, 30, 90)),
    data_source VARCHAR(50) NOT NULL DEFAULT 'new_metrics_function',
    
    -- KPIs principais da plataforma
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_ai_interactions INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    platform_mrr DECIMAL(12,2) DEFAULT 0,
    
    -- Métricas de chat agregadas
    total_chat_minutes INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    total_valid_conversations INTEGER DEFAULT 0,
    total_spam_conversations INTEGER DEFAULT 0,
    
    -- KPIs calculados da plataforma
    receita_uso_ratio DECIMAL(10,2) DEFAULT 0,
    operational_efficiency_pct DECIMAL(5,2) DEFAULT 0,
    spam_rate_pct DECIMAL(5,2) DEFAULT 0,
    cancellation_rate_pct DECIMAL(5,2) DEFAULT 0,
    
    -- Métricas de análise estratégica
    revenue_usage_distortion_index DECIMAL(8,2) DEFAULT 0,
    platform_health_score DECIMAL(5,2) DEFAULT 0,
    
    -- Contadores para análises
    tenants_above_usage INTEGER DEFAULT 0, -- Tenants usando mais que pagam (upsell)
    tenants_below_usage INTEGER DEFAULT 0, -- Tenants pagando mais que usam (distorção)
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint para evitar duplicatas
    UNIQUE(calculation_date, period_days, data_source)
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índices para tenant_metrics
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_tenant_period 
    ON tenant_metrics(tenant_id, period_days, calculation_date DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_metrics_calculation_date 
    ON tenant_metrics(calculation_date DESC, period_days);

CREATE INDEX IF NOT EXISTS idx_tenant_metrics_efficiency 
    ON tenant_metrics(efficiency_score DESC, period_days);

-- Índices para platform_metrics  
CREATE INDEX IF NOT EXISTS idx_platform_metrics_period_date 
    ON platform_metrics(period_days, calculation_date DESC);

CREATE INDEX IF NOT EXISTS idx_platform_metrics_data_source 
    ON platform_metrics(data_source, calculation_date DESC);

-- =====================================================
-- TRIGGERS PARA UPDATE TIMESTAMP
-- =====================================================

-- Trigger para tenant_metrics
CREATE OR REPLACE FUNCTION update_tenant_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_metrics_update_timestamp
    BEFORE UPDATE ON tenant_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_metrics_timestamp();

-- Trigger para platform_metrics
CREATE OR REPLACE FUNCTION update_platform_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_metrics_update_timestamp
    BEFORE UPDATE ON platform_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_platform_metrics_timestamp();

-- =====================================================
-- COMENTÁRIOS DAS TABELAS
-- =====================================================

COMMENT ON TABLE tenant_metrics IS 
'Métricas individuais por tenant e período. Elimina redundância ao separar dados de tenant dos dados de plataforma.';

COMMENT ON TABLE platform_metrics IS 
'Métricas agregadas da plataforma por período. Um único registro por período contém todos os KPIs da plataforma.';

COMMENT ON COLUMN tenant_metrics.revenue_participation_pct IS 
'Percentual que este tenant representa na receita total da plataforma';

COMMENT ON COLUMN platform_metrics.tenants_above_usage IS 
'Número de tenants que usam mais do que pagam (oportunidades de upsell)';

COMMENT ON COLUMN platform_metrics.tenants_below_usage IS 
'Número de tenants que pagam mais do que usam (análise de distorção)';

-- =====================================================
-- GRANTS E PERMISSÕES
-- =====================================================

-- Garantir acesso para o serviço
GRANT ALL PRIVILEGES ON tenant_metrics TO service_role;
GRANT ALL PRIVILEGES ON platform_metrics TO service_role;

-- Acesso de leitura para usuários autenticados
GRANT SELECT ON tenant_metrics TO authenticated;
GRANT SELECT ON platform_metrics TO authenticated;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS nas novas tabelas
ALTER TABLE tenant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metrics ENABLE ROW LEVEL SECURITY;

-- Policy para tenant_metrics: usuarios só veem dados do seu tenant
CREATE POLICY tenant_metrics_isolation ON tenant_metrics
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM user_tenants ut 
            WHERE ut.tenant_id = tenant_metrics.tenant_id
        )
        OR 
        auth.jwt() ->> 'role' = 'service_role'
    );

-- Policy para platform_metrics: apenas super admins
CREATE POLICY platform_metrics_super_admin ON platform_metrics
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role'
        OR
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.email = auth.jwt() ->> 'email' 
            AND au.role = 'super_admin'
        )
    );

-- =====================================================
-- VERIFICAÇÃO DA CRIAÇÃO
-- =====================================================

-- Verificar se as tabelas foram criadas corretamente
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tenant_metrics') THEN
        RAISE NOTICE '✅ Tabela tenant_metrics criada com sucesso';
    ELSE
        RAISE EXCEPTION '❌ Erro ao criar tabela tenant_metrics';
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'platform_metrics') THEN
        RAISE NOTICE '✅ Tabela platform_metrics criada com sucesso';
    ELSE
        RAISE EXCEPTION '❌ Erro ao criar tabela platform_metrics';
    END IF;
    
    RAISE NOTICE '🎉 Nova estrutura de métricas criada com sucesso!';
    RAISE NOTICE '📊 Próximo passo: atualizar função do cron job';
END $$;