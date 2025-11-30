-- ============================================================================
-- Migration: 059_fix_ddd_regex_normalize_phone.sql
-- Data: 2025-11-30
-- Autor: Claude
-- Objetivo: Corrigir regex de DDD na função normalize_phone_meta()
--
-- BUG IDENTIFICADO:
-- O regex de validação de DDD estava muito restritivo:
-- - Regex antigo: '^(1[1-9]|2[1-9]|3[1-5]|4[1-9]|5[1-5]|6[1-9]|7[1-9]|8[1-9]|9[1-9])$'
-- - DDDs rejeitados indevidamente: 36, 37, 38, 39, 56, 57, 58, 59 (todos válidos!)
-- - Taxa de rejeição: 8.6% (625 telefones de 7,261)
--
-- CORREÇÃO:
-- - Regex corrigido: '^([1-9][1-9])$' - Aceita todos os DDDs de 11 a 99
-- ============================================================================

-- ============================================================================
-- PASSO 1: Atualizar função normalize_phone_meta com regex corrigido
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_phone_meta(raw_input TEXT)
RETURNS TEXT AS $$
DECLARE
    cleaned TEXT;
    ddd TEXT;
    number_part TEXT;
BEGIN
    -- Retorna NULL para input vazio
    IF raw_input IS NULL OR TRIM(raw_input) = '' THEN
        RETURN NULL;
    END IF;

    -- Remove tudo exceto dígitos
    cleaned := regexp_replace(raw_input, '[^0-9]', '', 'g');

    -- Se começar com 55 (código do Brasil) e tiver mais de 11 dígitos, remove
    IF cleaned ~ '^55' AND length(cleaned) > 11 THEN
        cleaned := substring(cleaned from 3);
    END IF;

    -- Verifica comprimento válido (10 ou 11 dígitos: DDD + número)
    IF length(cleaned) NOT IN (10, 11) THEN
        RETURN NULL;
    END IF;

    -- Extrai DDD (primeiros 2 dígitos)
    ddd := substring(cleaned from 1 for 2);

    -- CORREÇÃO: Valida DDD brasileiro (11-99, excluindo 10, 20, 30, etc.)
    -- DDDs válidos vão de 11 a 99, onde ambos os dígitos são 1-9
    IF ddd !~ '^([1-9][1-9])$' THEN
        RETURN NULL;
    END IF;

    -- Extrai parte do número (após DDD)
    number_part := substring(cleaned from 3);

    -- Valida número (8 ou 9 dígitos, celular começa com 9)
    IF length(number_part) = 9 THEN
        -- Celular: deve começar com 9
        IF number_part !~ '^9' THEN
            RETURN NULL;
        END IF;
    ELSIF length(number_part) = 8 THEN
        -- Fixo: pode começar com 2, 3, 4, 5
        IF number_part !~ '^[2-5]' THEN
            -- Se não começar com 2-5, pode ser celular antigo (antes de 2012)
            -- Vamos aceitar para não perder números válidos
            NULL;
        END IF;
    ELSE
        RETURN NULL;
    END IF;

    -- Retorna no formato E.164 brasileiro: +55DDNNNNNNNNN
    RETURN '+55' || cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- PASSO 2: Verificar quantos telefones serão recuperados
-- ============================================================================

-- Análise ANTES da correção
SELECT
    'ANTES da correção' as fase,
    COUNT(*) as total_leads,
    COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as leads_com_phone,
    SUM(COALESCE(jsonb_array_length(phones_normalized), 0)) as total_phones_normalized
FROM instagram_leads;

-- ============================================================================
-- PASSO 3: Re-normalizar TODOS os telefones com a função corrigida
-- ============================================================================

-- Atualizar phones_normalized para todos os leads que tem phone ou additional_phones
UPDATE instagram_leads
SET
    phones_normalized = (
        SELECT COALESCE(
            jsonb_agg(DISTINCT normalized_phone ORDER BY normalized_phone),
            '[]'::jsonb
        )
        FROM (
            -- Telefone principal
            SELECT normalize_phone_meta(phone) as normalized_phone
            WHERE phone IS NOT NULL

            UNION

            -- WhatsApp number
            SELECT normalize_phone_meta(whatsapp_number::TEXT)
            WHERE whatsapp_number IS NOT NULL

            UNION

            -- Phone number alternativo
            SELECT normalize_phone_meta(phone_number::TEXT)
            WHERE phone_number IS NOT NULL

            UNION

            -- Bio phone
            SELECT normalize_phone_meta(bio_phone)
            WHERE bio_phone IS NOT NULL

            UNION

            -- Additional phones (array JSONB)
            SELECT normalize_phone_meta(phone_value)
            FROM jsonb_array_elements_text(COALESCE(additional_phones, '[]'::jsonb)) AS phone_value
            WHERE phone_value IS NOT NULL AND phone_value != ''

        ) phones
        WHERE normalized_phone IS NOT NULL
    ),
    updated_at = NOW()
WHERE phone IS NOT NULL
   OR whatsapp_number IS NOT NULL
   OR phone_number IS NOT NULL
   OR bio_phone IS NOT NULL
   OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0);

-- ============================================================================
-- PASSO 4: Análise DEPOIS da correção
-- ============================================================================

SELECT
    'DEPOIS da correção' as fase,
    COUNT(*) as total_leads,
    COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as leads_com_phone,
    SUM(COALESCE(jsonb_array_length(phones_normalized), 0)) as total_phones_normalized,
    COUNT(CASE WHEN jsonb_array_length(phones_normalized) > 0 THEN 1 END) as leads_com_phones_normalized
FROM instagram_leads;

-- ============================================================================
-- PASSO 5: Comparar telefone principal vs normalizado
-- ============================================================================

SELECT
    'Validação do phone principal' as metrica,
    COUNT(*) as total_com_phone,
    COUNT(CASE WHEN normalize_phone_meta(phone) IS NOT NULL THEN 1 END) as phone_valido,
    COUNT(CASE WHEN normalize_phone_meta(phone) IS NULL THEN 1 END) as phone_invalido,
    ROUND(
        COUNT(CASE WHEN normalize_phone_meta(phone) IS NOT NULL THEN 1 END)::NUMERIC /
        NULLIF(COUNT(*), 0) * 100,
        2
    ) as taxa_validacao_pct
FROM instagram_leads
WHERE phone IS NOT NULL;

-- ============================================================================
-- PASSO 6: Exemplos de telefones que antes eram rejeitados e agora são aceitos
-- ============================================================================

SELECT
    'Exemplos de DDDs recuperados' as info,
    substring(phone from 1 for 2) as ddd_extraido,
    phone as telefone_original,
    normalize_phone_meta(phone) as telefone_normalizado
FROM instagram_leads
WHERE phone IS NOT NULL
  AND phone ~ '^(36|37|38|39|56|57|58|59)'
LIMIT 10;

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
