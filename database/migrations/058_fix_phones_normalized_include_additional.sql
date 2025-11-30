-- ============================================================================
-- Migration: 058_fix_phones_normalized_include_additional.sql
-- Data: 2025-11-30
-- Autor: Claude
-- Objetivo: Corrigir bug - incluir additional_phones na normalização
-- BUG: phones_normalized não estava incluindo os telefones de additional_phones
-- ============================================================================

-- ============================================================================
-- PASSO 1: Atualizar a função do trigger para incluir additional_phones
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_normalize_instagram_lead()
RETURNS TRIGGER AS $$
BEGIN
    -- Normalizar telefones automaticamente (INCLUI additional_phones)
    NEW.phones_normalized := (
        SELECT COALESCE(
            jsonb_agg(DISTINCT normalized_phone),
            '[]'::jsonb
        )
        FROM (
            -- Telefone principal
            SELECT normalize_phone_meta(NEW.phone) as normalized_phone
            WHERE NEW.phone IS NOT NULL

            UNION

            -- WhatsApp number
            SELECT normalize_phone_meta(NEW.whatsapp_number::TEXT)
            WHERE NEW.whatsapp_number IS NOT NULL

            UNION

            -- Phone number alternativo
            SELECT normalize_phone_meta(NEW.phone_number::TEXT)
            WHERE NEW.phone_number IS NOT NULL

            UNION

            -- Bio phone
            SELECT normalize_phone_meta(NEW.bio_phone)
            WHERE NEW.bio_phone IS NOT NULL

            UNION

            -- CORREÇÃO: Additional phones (array JSONB)
            SELECT normalize_phone_meta(phone_value)
            FROM jsonb_array_elements_text(COALESCE(NEW.additional_phones, '[]'::jsonb)) AS phone_value
            WHERE phone_value IS NOT NULL AND phone_value != ''

        ) phones
        WHERE normalized_phone IS NOT NULL
    );

    -- Normalizar emails automaticamente (mantém igual)
    NEW.emails_normalized := (
        SELECT COALESCE(
            jsonb_agg(DISTINCT normalized_email),
            '[]'::jsonb
        )
        FROM (
            SELECT normalize_email_meta(NEW.email) as normalized_email
            WHERE NEW.email IS NOT NULL

            UNION

            SELECT normalize_email_meta(NEW.bio_email)
            WHERE NEW.bio_email IS NOT NULL

            UNION

            -- Additional emails (array JSONB)
            SELECT normalize_email_meta(email_value)
            FROM jsonb_array_elements_text(COALESCE(NEW.additional_emails, '[]'::jsonb)) AS email_value
            WHERE email_value IS NOT NULL AND email_value != ''

        ) emails
        WHERE normalized_email IS NOT NULL
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PASSO 2: Re-normalizar TODOS os leads existentes incluindo additional_phones
-- ============================================================================

UPDATE instagram_leads
SET phones_normalized = (
    SELECT COALESCE(
        jsonb_agg(DISTINCT normalized_phone),
        '[]'::jsonb
    )
    FROM (
        -- Telefone principal
        SELECT normalize_phone_meta(phone) as normalized_phone
        FROM instagram_leads il
        WHERE il.id = instagram_leads.id
          AND phone IS NOT NULL

        UNION

        -- WhatsApp number
        SELECT normalize_phone_meta(whatsapp_number::TEXT) as normalized_phone
        FROM instagram_leads il
        WHERE il.id = instagram_leads.id
          AND whatsapp_number IS NOT NULL

        UNION

        -- Phone number alternativo
        SELECT normalize_phone_meta(phone_number::TEXT) as normalized_phone
        FROM instagram_leads il
        WHERE il.id = instagram_leads.id
          AND phone_number IS NOT NULL

        UNION

        -- Bio phone
        SELECT normalize_phone_meta(bio_phone) as normalized_phone
        FROM instagram_leads il
        WHERE il.id = instagram_leads.id
          AND bio_phone IS NOT NULL

        UNION

        -- CORREÇÃO: Additional phones (array JSONB)
        SELECT normalize_phone_meta(phone_value) as normalized_phone
        FROM instagram_leads il,
             jsonb_array_elements_text(COALESCE(il.additional_phones, '[]'::jsonb)) AS phone_value
        WHERE il.id = instagram_leads.id
          AND phone_value IS NOT NULL
          AND phone_value != ''

    ) phones
    WHERE normalized_phone IS NOT NULL
)
WHERE phone IS NOT NULL
   OR whatsapp_number IS NOT NULL
   OR phone_number IS NOT NULL
   OR bio_phone IS NOT NULL
   OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0);

-- ============================================================================
-- PASSO 3: Re-normalizar emails também (incluindo additional_emails)
-- ============================================================================

UPDATE instagram_leads
SET emails_normalized = (
    SELECT COALESCE(
        jsonb_agg(DISTINCT normalized_email),
        '[]'::jsonb
    )
    FROM (
        -- Email principal
        SELECT normalize_email_meta(email) as normalized_email
        FROM instagram_leads il
        WHERE il.id = instagram_leads.id
          AND email IS NOT NULL

        UNION

        -- Bio email
        SELECT normalize_email_meta(bio_email) as normalized_email
        FROM instagram_leads il
        WHERE il.id = instagram_leads.id
          AND bio_email IS NOT NULL

        UNION

        -- Additional emails (array JSONB)
        SELECT normalize_email_meta(email_value) as normalized_email
        FROM instagram_leads il,
             jsonb_array_elements_text(COALESCE(il.additional_emails, '[]'::jsonb)) AS email_value
        WHERE il.id = instagram_leads.id
          AND email_value IS NOT NULL
          AND email_value != ''

    ) emails
    WHERE normalized_email IS NOT NULL
)
WHERE email IS NOT NULL
   OR bio_email IS NOT NULL
   OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0);

-- ============================================================================
-- PASSO 4: Validação - Comparar ANTES e DEPOIS
-- ============================================================================

SELECT
    'Telefones Normalizados' as metrica,
    COUNT(*) as total_leads,
    COUNT(CASE WHEN jsonb_array_length(phones_normalized) > 0 THEN 1 END) as leads_com_phones_normalized,
    SUM(jsonb_array_length(phones_normalized)) as total_phones_normalized,
    COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as leads_com_phone_principal,
    COUNT(CASE WHEN additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0 THEN 1 END) as leads_com_additional_phones
FROM instagram_leads;

-- ============================================================================
-- PASSO 5: Verificar se a correção funcionou
-- ============================================================================

-- Deve mostrar leads que agora têm phones_normalized vindos de additional_phones
SELECT
    COUNT(*) as leads_corrigidos,
    'Leads que tinham additional_phones mas não tinham phones_normalized' as descricao
FROM instagram_leads
WHERE (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
  AND jsonb_array_length(phones_normalized) > 0;

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
