-- ============================================================================
-- Migration: 060_fix_trigger_preserve_validated_phones.sql
-- Data: 2025-11-30
-- Autor: Claude
-- Objetivo: Corrigir trigger para preservar phones_normalized já validados
--
-- BUG IDENTIFICADO:
-- O trigger trg_normalize_instagram_lead() estava sobrescrevendo phones_normalized
-- mesmo quando já continha objetos validados com valid_whatsapp: true
-- Isso fazia com que a validação WhatsApp não persistisse
--
-- CORREÇÃO:
-- Verificar se phones_normalized já contém objetos (validados) antes de re-normalizar
-- Se o primeiro elemento for um objeto, preservar o array existente
-- ============================================================================

-- ============================================================================
-- PASSO 1: Atualizar função do trigger para preservar objetos validados
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_normalize_instagram_lead()
RETURNS TRIGGER AS $$
BEGIN
    -- CORREÇÃO: Se phones_normalized já contém objetos (validados), NÃO re-normalizar
    -- Objetos validados têm formato: {"number": "+55...", "valid_whatsapp": true}
    -- Strings não validadas têm formato: "+55..."
    IF NEW.phones_normalized IS NOT NULL
       AND jsonb_array_length(NEW.phones_normalized) > 0
       AND jsonb_typeof(NEW.phones_normalized->0) = 'object' THEN
        -- Preservar phones_normalized existente (já validado)
        -- Apenas normalizar emails
        NEW.emails_normalized := (
            SELECT COALESCE(
                jsonb_agg(DISTINCT normalized_email),
                '[]'::jsonb
            )
            FROM (
                SELECT normalize_email_meta(NEW.email) as normalized_email
                WHERE NEW.email IS NOT NULL

                UNION

                SELECT normalize_email_meta(email_value)
                FROM jsonb_array_elements_text(COALESCE(NEW.additional_emails, '[]'::jsonb)) AS email_value
                WHERE email_value IS NOT NULL AND email_value != ''

            ) emails
            WHERE normalized_email IS NOT NULL
        );

        RETURN NEW;
    END IF;

    -- Normalizar telefones automaticamente
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

            -- Phone number alternativo
            SELECT normalize_phone_meta(NEW.phone_number::TEXT)
            WHERE NEW.phone_number IS NOT NULL

            UNION

            -- Additional phones (array JSONB)
            SELECT normalize_phone_meta(phone_value)
            FROM jsonb_array_elements_text(COALESCE(NEW.additional_phones, '[]'::jsonb)) AS phone_value
            WHERE phone_value IS NOT NULL AND phone_value != ''

        ) phones
        WHERE normalized_phone IS NOT NULL
    );

    -- Normalizar emails automaticamente
    NEW.emails_normalized := (
        SELECT COALESCE(
            jsonb_agg(DISTINCT normalized_email),
            '[]'::jsonb
        )
        FROM (
            SELECT normalize_email_meta(NEW.email) as normalized_email
            WHERE NEW.email IS NOT NULL

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
-- PASSO 2: Verificar que o trigger está usando a função atualizada
-- ============================================================================

-- O trigger já existe, apenas atualizamos a função
-- Verificar existência
SELECT
    'Trigger atualizado' as status,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_normalize_instagram_lead_before';

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
