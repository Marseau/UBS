-- Schema para métricas pré-calculadas
-- Gerado automaticamente para otimizar performance do dashboard

-- Tabela principal de métricas SaaS (calculadas diariamente)
CREATE TABLE IF NOT EXISTS saas_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    active_tenants INTEGER DEFAULT 0,
    total_tenants INTEGER DEFAULT 0,
    mrr DECIMAL(12,2) DEFAULT 0, -- Monthly Recurring Revenue
    arr DECIMAL(12,2) DEFAULT 0, -- Annual Recurring Revenue
    churn_rate DECIMAL(5,2) DEFAULT 0, -- Porcentagem de churn
    conversion_rate DECIMAL(5,2) DEFAULT 0, -- Taxa de conversão
    avg_revenue_per_tenant DECIMAL(10,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    ai_interactions INTEGER DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(metric_date)
);

-- Tabela de scores de risco por tenant (calculados diariamente)
CREATE TABLE IF NOT EXISTS tenant_risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_status VARCHAR(20) NOT NULL CHECK (risk_status IN ('Baixo Risco', 'Risco Médio', 'Alto Risco')),
    
    -- Fatores de risco (JSON para flexibilidade)
    risk_factors JSONB DEFAULT '{}',
    
    -- Métricas específicas usadas no cálculo
    last_activity_days INTEGER DEFAULT 0,
    cancellation_rate DECIMAL(5,2) DEFAULT 0,
    revenue_trend DECIMAL(5,2) DEFAULT 0, -- Tendência de receita (crescimento/declínio)
    customer_satisfaction DECIMAL(3,2) DEFAULT 0, -- Score de satisfação (0-5)
    ai_success_rate DECIMAL(5,2) DEFAULT 0, -- Taxa de sucesso das interações IA
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(tenant_id, DATE(calculated_at))
);

-- Tabela de distribuição de tenants por domínio (calculada diariamente)
CREATE TABLE IF NOT EXISTS tenant_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    business_domain VARCHAR(50) NOT NULL,
    tenant_count INTEGER DEFAULT 0,
    revenue_share DECIMAL(5,2) DEFAULT 0, -- Porcentagem da receita total
    growth_rate DECIMAL(5,2) DEFAULT 0, -- Taxa de crescimento do domínio
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(metric_date, business_domain)
);

-- Tabela de métricas de crescimento (calculadas mensalmente)
CREATE TABLE IF NOT EXISTS growth_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_month DATE NOT NULL, -- Primeiro dia do mês
    new_tenants INTEGER DEFAULT 0,
    churned_tenants INTEGER DEFAULT 0,
    revenue_growth DECIMAL(5,2) DEFAULT 0,
    customer_growth DECIMAL(5,2) DEFAULT 0,
    mrr_growth DECIMAL(5,2) DEFAULT 0,
    platform_health_score INTEGER DEFAULT 0 CHECK (platform_health_score >= 0 AND platform_health_score <= 100),
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(metric_month)
);

-- Tabela de top tenants (calculada semanalmente)
CREATE TABLE IF NOT EXISTS top_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ranking_date DATE NOT NULL,
    rank_position INTEGER NOT NULL,
    revenue DECIMAL(10,2) DEFAULT 0,
    growth_rate DECIMAL(5,2) DEFAULT 0,
    appointment_count INTEGER DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(ranking_date, tenant_id)
);

-- Tabela de métricas de conversão (calculadas diariamente)
CREATE TABLE IF NOT EXISTS conversion_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    leads_generated INTEGER DEFAULT 0,
    appointments_booked INTEGER DEFAULT 0,
    appointments_completed INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(tenant_id, metric_date)
);

-- Índices adicionais para otimização
CREATE INDEX IF NOT EXISTS idx_saas_metrics_date ON saas_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_risk_scores_tenant ON tenant_risk_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_risk_scores_date ON tenant_risk_scores(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_distribution_date ON tenant_distribution(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_growth_metrics_month ON growth_metrics(metric_month DESC);
CREATE INDEX IF NOT EXISTS idx_top_tenants_date ON top_tenants(ranking_date DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_metrics_date ON conversion_metrics(metric_date DESC);

-- Comentários para documentação
COMMENT ON TABLE saas_metrics IS 'Métricas principais da plataforma SaaS calculadas diariamente';
COMMENT ON TABLE tenant_risk_scores IS 'Scores de risco por tenant com fatores detalhados';
COMMENT ON TABLE tenant_distribution IS 'Distribuição de tenants por domínio de negócio';
COMMENT ON TABLE growth_metrics IS 'Métricas de crescimento calculadas mensalmente';
COMMENT ON TABLE top_tenants IS 'Ranking dos melhores tenants por performance';
COMMENT ON TABLE conversion_metrics IS 'Métricas de conversão por tenant';