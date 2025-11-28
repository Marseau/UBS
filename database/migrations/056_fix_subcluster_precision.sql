-- Migration 056: Corrigir precisão numérica nos subclusters
-- Data: 2025-11-27
-- Problema: avg_contact_rate NUMERIC(5,4) causa overflow quando valor > 9.9999

-- Aumentar precisão do avg_contact_rate
ALTER TABLE campaign_subclusters
ALTER COLUMN avg_contact_rate TYPE NUMERIC(10,4);

-- Garantir que relevance_score também tem espaço suficiente
ALTER TABLE campaign_subclusters
ALTER COLUMN relevance_score TYPE NUMERIC(10,4);

-- Comentário
COMMENT ON COLUMN campaign_subclusters.avg_contact_rate IS 'Taxa média de contato do subcluster (0-100%)';
