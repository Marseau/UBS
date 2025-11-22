-- Migration 051: Add account rotation to lead_search_terms
-- Permite round-robin entre múltiplas contas de Instagram

-- Adicionar coluna para rastrear última conta que processou
ALTER TABLE lead_search_terms
ADD COLUMN IF NOT EXISTS last_processed_account VARCHAR(50) DEFAULT NULL;

-- Comentário na coluna
COMMENT ON COLUMN lead_search_terms.last_processed_account IS 'Última conta de Instagram que processou esta hashtag (para round-robin entre contas)';

-- Index para otimizar busca de hashtags disponíveis por conta
CREATE INDEX IF NOT EXISTS idx_lead_search_terms_account_rotation
ON lead_search_terms(is_active, last_processed_account)
WHERE is_active = TRUE;

-- Log da migration
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 051: Coluna last_processed_account adicionada com sucesso';
  RAISE NOTICE '   Sistema de round-robin entre contas ativado';
END $$;
