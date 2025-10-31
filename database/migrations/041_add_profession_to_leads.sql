-- Migration: Adicionar campo profession (qualificação profissional)
-- Objetivo: Armazenar a profissão/qualificação específica do lead
-- Exemplos: "Cardiologista", "Nutricionista Esportiva", "Personal Trainer", "Advogado Trabalhista"

-- Adicionar coluna profession à tabela instagram_leads
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS profession TEXT;

-- Adicionar índice para buscas por profissão
CREATE INDEX IF NOT EXISTS idx_instagram_leads_profession ON instagram_leads(profession);

-- Comentários
COMMENT ON COLUMN instagram_leads.profession IS 'Qualificação profissional específica do lead (ex: Cardiologista, Nutricionista, Personal Trainer)';
