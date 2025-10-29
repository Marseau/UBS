-- Migration: Adicionar campos de enriquecimento na tabela instagram_leads
-- Data: 2025-10-29
-- Objetivo: Expandir dados extraídos (cidade, estado, endereço, CEP, nome/sobrenome)

-- Adicionar novos campos para dados demográficos e geográficos
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(2),
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Criar índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_instagram_leads_city ON instagram_leads(city);
CREATE INDEX IF NOT EXISTS idx_instagram_leads_state ON instagram_leads(state);
CREATE INDEX IF NOT EXISTS idx_instagram_leads_zip_code ON instagram_leads(zip_code);

-- Comentários explicativos
COMMENT ON COLUMN instagram_leads.city IS 'Cidade extraída de hashtags, endereço ou bio';
COMMENT ON COLUMN instagram_leads.state IS 'Estado (UF) extraído de hashtags ou endereço';
COMMENT ON COLUMN instagram_leads.neighborhood IS 'Bairro extraído de hashtags ou endereço';
COMMENT ON COLUMN instagram_leads.address IS 'Endereço completo quando disponível';
COMMENT ON COLUMN instagram_leads.zip_code IS 'CEP brasileiro extraído';
COMMENT ON COLUMN instagram_leads.first_name IS 'Primeiro nome extraído';
COMMENT ON COLUMN instagram_leads.last_name IS 'Último nome (sobrenome) extraído';
