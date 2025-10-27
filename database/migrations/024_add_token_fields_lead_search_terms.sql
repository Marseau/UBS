-- Migration 024: Add token tracking fields to lead_search_terms
-- Adiciona campos para rastrear tokens usados na geração de termos

-- 1. Adicionar campos de tokens
ALTER TABLE lead_search_terms
ADD COLUMN IF NOT EXISTS tokens_prompt INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_completion INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_total INTEGER DEFAULT 0;

-- 2. Remover campos desnecessários (vinculação com reels)
ALTER TABLE lead_search_terms
DROP COLUMN IF EXISTS content_id,
DROP COLUMN IF EXISTS reel_number,
DROP COLUMN IF EXISTS week_number,
DROP COLUMN IF EXISTS year;

-- 3. Comentários
COMMENT ON COLUMN lead_search_terms.tokens_prompt IS 'Número de tokens usados no prompt (input)';
COMMENT ON COLUMN lead_search_terms.tokens_completion IS 'Número de tokens na resposta (output)';
COMMENT ON COLUMN lead_search_terms.tokens_total IS 'Total de tokens usados (prompt + completion)';
