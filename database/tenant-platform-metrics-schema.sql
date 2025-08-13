-- Schema para métricas tenant-platform (visão do tenant na plataforma)
-- Tabelas pre-calculadas populadas por cron jobs

-- Tabela principal de métricas tenant-platform (calculadas mensalmente)
CREATE TABLE IF NOT EXISTS tenant_platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_month DATE NOT NULL, -- Primeiro dia do mês
    
    -- Participação na receita da plataforma
    platform_revenue_participation_pct DECIMAL(5,2) DEFAULT 0, -- % da receita total
    tenant_revenue_value DECIMAL(12,2) DEFAULT 0, -- Valor em R$ do tenant
    platform_total_revenue DECIMAL(12,2) DEFAULT 0, -- Total da plataforma
    
    -- Participação em agendamentos
    platform_appointments_participation_pct DECIMAL(5,2) DEFAULT 0,
    tenant_appointments_count INTEGER DEFAULT 0,
    platform_total_appointments INTEGER DEFAULT 0,
    
    -- Participação em clientes
    platform_customers_participation_pct DECIMAL(5,2) DEFAULT 0,
    tenant_customers_count INTEGER DEFAULT 0,
    platform_total_customers INTEGER DEFAULT 0,
    
    -- Participação em IA
    platform_ai_participation_pct DECIMAL(5,2) DEFAULT 0,
    tenant_ai_interactions INTEGER DEFAULT 0,
    platform_total_ai_interactions INTEGER DEFAULT 0,
    
    -- Ranking e posição
    ranking_position INTEGER DEFAULT 0,
    total_tenants_in_ranking INTEGER DEFAULT 0,
    ranking_category VARCHAR(20) DEFAULT 'Not Ranked', -- 'Top 10%', 'Top 25%', etc.
    
    -- Risk assessment
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_status VARCHAR(20) DEFAULT 'Unknown', -- 'Low Risk', 'Medium Risk', 'High Risk'
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para performance
    UNIQUE(tenant_id, metric_month)
);

-- Índices adicionais
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_tenant_id ON tenant_platform_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_month ON tenant_platform_metrics(metric_month);
CREATE INDEX IF NOT EXISTS idx_tenant_platform_metrics_ranking ON tenant_platform_metrics(ranking_position);

-- Tabela para evolução da participação do tenant (dados históricos)
CREATE TABLE IF NOT EXISTS tenant_platform_evolution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    evolution_date DATE NOT NULL,
    
    -- Evolução da participação
    revenue_participation_pct DECIMAL(5,2) DEFAULT 0,
    appointments_participation_pct DECIMAL(5,2) DEFAULT 0,
    customers_participation_pct DECIMAL(5,2) DEFAULT 0,
    ai_participation_pct DECIMAL(5,2) DEFAULT 0,
    
    -- Variação vs mês anterior
    revenue_participation_change_pct DECIMAL(5,2) DEFAULT 0,
    appointments_participation_change_pct DECIMAL(5,2) DEFAULT 0,
    customers_participation_change_pct DECIMAL(5,2) DEFAULT 0,
    ai_participation_change_pct DECIMAL(5,2) DEFAULT 0,
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices
    UNIQUE(tenant_id, evolution_date)
);

-- Tabela para ranking de tenants (atualizada diariamente)
CREATE TABLE IF NOT EXISTS tenant_platform_ranking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ranking_date DATE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Posição no ranking
    position INTEGER NOT NULL,
    previous_position INTEGER DEFAULT 0,
    position_change INTEGER DEFAULT 0, -- +1 subiu, -1 desceu, 0 manteve
    
    -- Critérios de ranking
    total_score DECIMAL(8,2) DEFAULT 0,
    revenue_score DECIMAL(8,2) DEFAULT 0,
    appointments_score DECIMAL(8,2) DEFAULT 0,
    growth_score DECIMAL(8,2) DEFAULT 0,
    engagement_score DECIMAL(8,2) DEFAULT 0,
    
    -- Contexto do ranking
    total_tenants INTEGER DEFAULT 0,
    percentile DECIMAL(5,2) DEFAULT 0, -- Em qual percentil está
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices
    UNIQUE(ranking_date, tenant_id),
    UNIQUE(ranking_date, position)
);

-- Tabela para distribuição de serviços por tenant (para gráficos)
CREATE TABLE IF NOT EXISTS tenant_services_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    
    -- Distribuição por categoria de serviço
    service_category VARCHAR(50) NOT NULL,
    service_count INTEGER DEFAULT 0,
    service_revenue DECIMAL(10,2) DEFAULT 0,
    service_appointments INTEGER DEFAULT 0,
    
    -- Participação dentro do tenant
    tenant_service_participation_pct DECIMAL(5,2) DEFAULT 0,
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices
    UNIQUE(tenant_id, calculation_date, service_category)
);

-- Tabela para contexto da plataforma (dados agregados)
CREATE TABLE IF NOT EXISTS platform_context_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    
    -- Totais da plataforma
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_ai_interactions INTEGER DEFAULT 0,
    total_active_tenants INTEGER DEFAULT 0,
    
    -- Médias da plataforma
    avg_tenant_revenue DECIMAL(10,2) DEFAULT 0,
    avg_tenant_appointments INTEGER DEFAULT 0,
    avg_tenant_customers INTEGER DEFAULT 0,
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices
    UNIQUE(metric_date)
);

-- Comentários para documentação
COMMENT ON TABLE tenant_platform_metrics IS 'Métricas de participação do tenant na plataforma, calculadas mensalmente';
COMMENT ON TABLE tenant_platform_evolution IS 'Evolução histórica da participação do tenant na plataforma';
COMMENT ON TABLE tenant_platform_ranking IS 'Ranking diário de tenants baseado em múltiplos critérios';
COMMENT ON TABLE tenant_services_distribution IS 'Distribuição de serviços por tenant para gráficos';
COMMENT ON TABLE platform_context_metrics IS 'Métricas agregadas da plataforma para contexto';