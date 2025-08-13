-- MIGRATION: Adicionar coluna metric_data à platform_metrics
-- Data: 2025-08-08
-- Objetivo: Criar 4º campo JSON nativo para compatibilidade total com tenant_metrics

-- 1. Adicionar a coluna metric_data
ALTER TABLE platform_metrics 
ADD COLUMN IF NOT EXISTS metric_data JSONB DEFAULT '{}'::jsonb;

-- 2. Adicionar comentário para documentação
COMMENT ON COLUMN platform_metrics.metric_data IS 'Quarto campo JSON com metadados do sistema e dados de formatação';

-- 3. Criar índice para performance (opcional)
CREATE INDEX IF NOT EXISTS idx_platform_metrics_metric_data 
ON platform_metrics USING gin (metric_data);

-- 4. Verificar se a coluna foi adicionada
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'platform_metrics' 
AND column_name = 'metric_data';

-- 5. Mostrar estrutura final da tabela
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'platform_metrics'
ORDER BY ordinal_position;