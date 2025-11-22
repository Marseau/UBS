-- ============================================
-- Script de Limpeza de Dados Instagram Leads
-- ============================================
-- Remove emails @sentry inválidos e normaliza telefones/emails
-- Data: 2025-01-11
-- ============================================

-- BACKUP: Criar tabela de backup antes da limpeza
CREATE TABLE IF NOT EXISTS instagram_leads_backup_20250111 AS
SELECT * FROM instagram_leads;

-- ============================================
-- PASSO 1: Remover emails @sentry do additional_emails
-- ============================================
UPDATE instagram_leads
SET additional_emails = (
  SELECT jsonb_agg(email)
  FROM jsonb_array_elements_text(additional_emails) AS email
  WHERE email NOT LIKE '%@sentry%'
    AND email NOT LIKE '%@sentry-next%'
)
WHERE additional_emails::text LIKE '%sentry%';

-- ============================================
-- PASSO 2: Recalcular emails_normalized (sem @sentry)
-- ============================================
UPDATE instagram_leads
SET emails_normalized = (
  SELECT COALESCE(jsonb_agg(DISTINCT normalized_email), '[]'::jsonb)
  FROM (
    -- Email principal
    SELECT LOWER(TRIM(email)) as normalized_email
    FROM instagram_leads il
    WHERE il.id = instagram_leads.id
      AND email IS NOT NULL
      AND email != ''
      AND email NOT LIKE '%@sentry%'

    UNION

    -- Emails adicionais (já sem @sentry após PASSO 1)
    SELECT LOWER(TRIM(email_value::text)) as normalized_email
    FROM instagram_leads il,
         jsonb_array_elements_text(il.additional_emails) AS email_value
    WHERE il.id = instagram_leads.id
      AND email_value IS NOT NULL
      AND email_value::text != ''
  ) AS all_emails
  WHERE normalized_email IS NOT NULL
);

-- ============================================
-- PASSO 3: Remover telefones duplicados do additional_phones
-- ============================================
UPDATE instagram_leads
SET additional_phones = (
  SELECT COALESCE(jsonb_agg(DISTINCT phone_cleaned), '[]'::jsonb)
  FROM (
    SELECT regexp_replace(phone::text, '[^0-9]', '', 'g') as phone_cleaned
    FROM jsonb_array_elements_text(additional_phones) AS phone
  ) AS phones
  WHERE phone_cleaned IS NOT NULL AND phone_cleaned != ''
);

-- ============================================
-- PASSO 4: Recalcular phones_normalized (telefones únicos normalizados)
-- ============================================
UPDATE instagram_leads
SET phones_normalized = (
  SELECT COALESCE(jsonb_agg(DISTINCT normalized_phone ORDER BY normalized_phone), '[]'::jsonb)
  FROM (
    -- Telefone principal
    SELECT
      CASE
        WHEN phone_cleaned ~ '^55[1-9][0-9]{9,10}$' THEN '+' || phone_cleaned
        WHEN phone_cleaned ~ '^[1-9][0-9]{9,10}$' THEN '+55' || phone_cleaned
        ELSE NULL
      END as normalized_phone
    FROM (
      SELECT regexp_replace(phone, '[^0-9]', '', 'g') as phone_cleaned
      FROM instagram_leads il
      WHERE il.id = instagram_leads.id
        AND phone IS NOT NULL
        AND phone != ''
    ) AS p

    UNION

    -- Telefones adicionais
    SELECT
      CASE
        WHEN phone_cleaned ~ '^55[1-9][0-9]{9,10}$' THEN '+' || phone_cleaned
        WHEN phone_cleaned ~ '^[1-9][0-9]{9,10}$' THEN '+55' || phone_cleaned
        ELSE NULL
      END as normalized_phone
    FROM (
      SELECT regexp_replace(phone_value::text, '[^0-9]', '', 'g') as phone_cleaned
      FROM instagram_leads il,
           jsonb_array_elements_text(il.additional_phones) AS phone_value
      WHERE il.id = instagram_leads.id
    ) AS ap
  ) AS all_phones
  WHERE normalized_phone IS NOT NULL
);

-- ============================================
-- PASSO 5: Limpar arrays vazios
-- ============================================
UPDATE instagram_leads
SET additional_emails = '[]'::jsonb
WHERE additional_emails IS NULL OR jsonb_array_length(additional_emails) = 0;

UPDATE instagram_leads
SET additional_phones = '[]'::jsonb
WHERE additional_phones IS NULL OR jsonb_array_length(additional_phones) = 0;

UPDATE instagram_leads
SET emails_normalized = '[]'::jsonb
WHERE emails_normalized IS NULL OR jsonb_array_length(emails_normalized) = 0;

UPDATE instagram_leads
SET phones_normalized = '[]'::jsonb
WHERE phones_normalized IS NULL OR jsonb_array_length(phones_normalized) = 0;

-- ============================================
-- RELATÓRIO: Verificação pós-limpeza
-- ============================================
SELECT
  'RELATÓRIO DE LIMPEZA' as titulo,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN emails_normalized::text LIKE '%sentry%' THEN 1 END) as leads_com_sentry_restante,
  SUM(jsonb_array_length(additional_emails)) as total_additional_emails,
  SUM(jsonb_array_length(additional_phones)) as total_additional_phones,
  AVG(jsonb_array_length(emails_normalized)) as media_emails_normalized,
  AVG(jsonb_array_length(phones_normalized)) as media_phones_normalized
FROM instagram_leads;

-- Leads mais afetados pela limpeza
SELECT
  username,
  full_name,
  jsonb_array_length(emails_normalized) as emails_apos_limpeza,
  jsonb_array_length(phones_normalized) as phones_apos_limpeza
FROM instagram_leads
WHERE id IN (
  'f2af4902-8a55-4168-8bec-8a297eb68a61', -- gioesteticaavancada
  '574f4456-b729-44a9-ba92-7815f7b0c813', -- marcelbozza
  'bcba5526-7aec-44a1-96c9-772bae16eec3'  -- digi.girls
)
ORDER BY emails_apos_limpeza DESC;
