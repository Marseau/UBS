-- Migration 024: Remove campos desnecessários da tabela lead_search_terms
-- Remove vinculação com reels/semanas que não são necessários

-- 1. Remover colunas desnecessárias
ALTER TABLE lead_search_terms
DROP COLUMN IF EXISTS content_id,
DROP COLUMN IF EXISTS reel_number,
DROP COLUMN IF EXISTS week_number,
DROP COLUMN IF EXISTS year;

-- 2. Comentários atualizados
COMMENT ON TABLE lead_search_terms IS 'Termos de pesquisa do Instagram gerados por IA - independentes de reels/semanas';
COMMENT ON COLUMN lead_search_terms.categoria_geral IS 'Categoria principal do segmento (ex: Marketing Digital, Saúde)';
COMMENT ON COLUMN lead_search_terms.area_especifica IS 'Área específica dentro da categoria (ex: Gestão de Tráfego Pago)';
COMMENT ON COLUMN lead_search_terms.target_segment IS 'Segmento identificador (ex: marketing_digital_trafego)';
COMMENT ON COLUMN lead_search_terms.search_terms IS 'Array JSONB com ~100 termos de pesquisa genéricos';
