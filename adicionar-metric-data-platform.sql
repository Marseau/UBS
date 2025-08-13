-- Adicionar campo metric_data na tabela platform_metrics para completar os 4 campos JSON
-- Mantendo consistência com tenant_metrics

ALTER TABLE platform_metrics 
ADD COLUMN metric_data JSONB;

-- Comentário explicativo
COMMENT ON COLUMN platform_metrics.metric_data IS 'Campo agregado de metric_data dos tenants - dados legados e complementares';

-- Verificar estrutura após alteração
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'platform_metrics' 
AND table_schema = 'public'
ORDER BY ordinal_position;