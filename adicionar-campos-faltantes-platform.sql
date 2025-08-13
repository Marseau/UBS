-- Adicionar os 5 campos faltantes na platform_metrics para igualar tenant_metrics
-- Mantendo consistência estrutural entre as tabelas

ALTER TABLE platform_metrics 
ADD COLUMN calculated_at TIMESTAMPTZ,
ADD COLUMN metric_data JSONB,
ADD COLUMN metric_type TEXT DEFAULT 'platform_aggregated',
ADD COLUMN tenant_id UUID,  -- Para referência quando necessário
ADD COLUMN tenant_name TEXT; -- Para referência quando necessário

-- Comentários explicativos
COMMENT ON COLUMN platform_metrics.calculated_at IS 'Data/hora do cálculo das métricas agregadas';
COMMENT ON COLUMN platform_metrics.metric_data IS 'Dados legados e complementares agregados dos tenants';
COMMENT ON COLUMN platform_metrics.metric_type IS 'Tipo da métrica da plataforma (sempre platform_aggregated)';
COMMENT ON COLUMN platform_metrics.tenant_id IS 'Referência de tenant quando aplicável (normalmente NULL para métricas de plataforma)';
COMMENT ON COLUMN platform_metrics.tenant_name IS 'Nome do tenant quando aplicável (normalmente NULL)';

-- Verificar estrutura após alteração
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'platform_metrics' 
AND table_schema = 'public'
ORDER BY ordinal_position;