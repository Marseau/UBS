-- ============================================================================
-- Script: Normalização de Telefones e Emails para Padrão Meta
-- Data: 2025-11-08
-- Objetivo: Normalizar contatos para formato aceito pelo Meta Ads Customer Audience
-- ============================================================================

-- PASSO 1: Adicionar colunas normalizadas (se não existirem)
-- ============================================================================
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS phones_normalized JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS emails_normalized JSONB DEFAULT '[]'::jsonb;

-- Adicionar índices GIN para performance em queries JSONB
CREATE INDEX IF NOT EXISTS idx_instagram_leads_phones_normalized
ON instagram_leads USING GIN(phones_normalized);

CREATE INDEX IF NOT EXISTS idx_instagram_leads_emails_normalized
ON instagram_leads USING GIN(emails_normalized);

-- Comentários das colunas
COMMENT ON COLUMN instagram_leads.phones_normalized IS 'Array JSONB de telefones normalizados no padrão Meta: +5511999887766 (somente números + código país)';
COMMENT ON COLUMN instagram_leads.emails_normalized IS 'Array JSONB de emails normalizados no padrão Meta: lowercase + trim';

-- ============================================================================
-- PASSO 2: UPDATE - Normalizar telefones para padrão Meta
-- ============================================================================
-- Padrão Meta: +[código_país][DDD][número] - SOMENTE NÚMEROS
-- Exemplo: +5511999887766

UPDATE instagram_leads
SET phones_normalized = (
  SELECT COALESCE(
    jsonb_agg(DISTINCT normalized_phone),
    '[]'::jsonb
  )
  FROM (
    SELECT
      CASE
        -- Remover TODOS os caracteres não-numéricos primeiro
        WHEN phone IS NOT NULL THEN
          CASE
            -- Se após limpar já tem 55 no início e tem 12-13 dígitos
            WHEN REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE '55%'
              AND LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) BETWEEN 12 AND 13
              THEN '+' || REGEXP_REPLACE(phone, '[^0-9]', '', 'g')

            -- Se tem 10-11 dígitos (DDD + número)
            WHEN LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) IN (10, 11)
              THEN '+55' || REGEXP_REPLACE(phone, '[^0-9]', '', 'g')

            -- Inválido (muito curto ou muito longo)
            ELSE NULL
          END
        ELSE NULL
      END as normalized_phone
    FROM instagram_leads il
    WHERE il.id = instagram_leads.id
      AND il.phone IS NOT NULL
  ) phones
  WHERE normalized_phone IS NOT NULL
)
WHERE phone IS NOT NULL;

-- ============================================================================
-- PASSO 3: UPDATE - Normalizar emails para padrão Meta
-- ============================================================================
-- Padrão Meta: lowercase + trim + validar @

UPDATE instagram_leads
SET emails_normalized = (
  SELECT COALESCE(
    jsonb_agg(DISTINCT normalized_email),
    '[]'::jsonb
  )
  FROM (
    SELECT
      CASE
        -- Validar formato e normalizar
        WHEN email IS NOT NULL AND email LIKE '%@%'
          THEN LOWER(TRIM(email))
        ELSE NULL
      END as normalized_email
    FROM instagram_leads il
    WHERE il.id = instagram_leads.id
      AND il.email IS NOT NULL
  ) emails
  WHERE normalized_email IS NOT NULL
)
WHERE email IS NOT NULL;

-- ============================================================================
-- PASSO 4: Validação - Estatísticas de normalização
-- ============================================================================
SELECT
  'Telefones' as tipo,
  COUNT(*) as total_leads,
  COUNT(phone) as com_original,
  COUNT(CASE WHEN jsonb_array_length(phones_normalized) > 0 THEN 1 END) as com_normalizado,
  COUNT(CASE WHEN phone IS NOT NULL AND jsonb_array_length(phones_normalized) = 0 THEN 1 END) as falhas_normalizacao
FROM instagram_leads

UNION ALL

SELECT
  'Emails' as tipo,
  COUNT(*) as total_leads,
  COUNT(email) as com_original,
  COUNT(CASE WHEN jsonb_array_length(emails_normalized) > 0 THEN 1 END) as com_normalizado,
  COUNT(CASE WHEN email IS NOT NULL AND jsonb_array_length(emails_normalized) = 0 THEN 1 END) as falhas_normalizacao
FROM instagram_leads;

-- ============================================================================
-- PASSO 5: Validação - Amostra de resultados
-- ============================================================================
SELECT
  username,
  phone as phone_original,
  phones_normalized,
  email as email_original,
  emails_normalized
FROM instagram_leads
WHERE phone IS NOT NULL OR email IS NOT NULL
ORDER BY RANDOM()
LIMIT 20;

-- ============================================================================
-- PASSO 6: Validação - Verificar padrão Meta
-- ============================================================================
-- Telefones devem ter 13-14 caracteres e iniciar com +55
SELECT
  'Telefones fora do padrão' as alerta,
  COUNT(*) as quantidade
FROM instagram_leads,
  jsonb_array_elements_text(phones_normalized) as phone
WHERE phone NOT LIKE '+55%'
   OR LENGTH(phone) NOT BETWEEN 13 AND 14;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
