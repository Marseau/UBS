-- ============================================================================
-- Migration: 061_add_hashtag_origem_to_pre_leads.sql
-- Data: 2025-11-30
-- Objetivo: Adicionar coluna hashtag_origem para rastreabilidade
--
-- Esta coluna permite saber de qual hashtag os seguidores foram coletados
-- Ex: seguidores de @perfil1 vieram da busca por #cabeleireirasp
-- ============================================================================

-- Adicionar coluna hashtag_origem
ALTER TABLE pre_leads ADD COLUMN IF NOT EXISTS hashtag_origem TEXT;

-- Comentário explicativo
COMMENT ON COLUMN pre_leads.hashtag_origem IS 'Hashtag de origem usada para encontrar o source_username (para rastreabilidade)';

-- Criar índice para consultas por hashtag
CREATE INDEX IF NOT EXISTS idx_pre_leads_hashtag_origem ON pre_leads(hashtag_origem);

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
