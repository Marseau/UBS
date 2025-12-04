-- Tabela para armazenar métricas diárias pré-calculadas
CREATE TABLE IF NOT EXISTS instagram_daily_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL UNIQUE,
    
    -- Leads (pool ativo 45d naquela data)
    total_leads INTEGER DEFAULT 0,
    leads_with_contact INTEGER DEFAULT 0,
    
    -- Hashtags (pool ativo 90d naquela data)  
    total_hashtags INTEGER DEFAULT 0,
    hashtags_with_contact INTEGER DEFAULT 0,
    
    -- Scraping do dia (novos + atualizados)
    scraped_new INTEGER DEFAULT 0,
    scraped_updated INTEGER DEFAULT 0,
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índice para busca rápida
    CONSTRAINT idx_metric_date UNIQUE (metric_date)
);

-- Índice para queries de range de datas
CREATE INDEX IF NOT EXISTS idx_instagram_daily_metrics_date 
ON instagram_daily_metrics(metric_date DESC);

-- Comentário na tabela
COMMENT ON TABLE instagram_daily_metrics IS 'Métricas diárias pré-calculadas para dashboard de inteligência';
