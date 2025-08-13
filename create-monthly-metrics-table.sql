-- TABELA PARA CACHE DE MÉTRICAS MENSAIS
-- Evita recalcular os mesmos meses repetidamente

CREATE TABLE IF NOT EXISTS monthly_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL, -- Formato: '2025-08', '2025-07', etc.
    
    -- Métricas do mês
    conversations_count INTEGER DEFAULT 0,
    revenue_amount DECIMAL(10,2) DEFAULT 0,
    unique_customers_count INTEGER DEFAULT 0,
    
    -- Metadados
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint para evitar duplicatas
    CONSTRAINT unique_tenant_month UNIQUE(tenant_id, year_month)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_monthly_metrics_tenant_id ON monthly_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_metrics_year_month ON monthly_metrics(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_metrics_tenant_month ON monthly_metrics(tenant_id, year_month);

-- Comentários
COMMENT ON TABLE monthly_metrics IS 'Cache de métricas mensais para evitar recálculos desnecessários';
COMMENT ON COLUMN monthly_metrics.year_month IS 'Formato YYYY-MM para identificar o mês';
COMMENT ON COLUMN monthly_metrics.conversations_count IS 'Número de conversas únicas (por session_id) no mês';
COMMENT ON COLUMN monthly_metrics.revenue_amount IS 'Receita total de appointments completed no mês';
COMMENT ON COLUMN monthly_metrics.unique_customers_count IS 'Clientes únicos que fizeram appointments no mês';