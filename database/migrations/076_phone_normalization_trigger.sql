-- ============================================================================
-- MIGRATION 076: Phone Normalization Trigger (v2 - usa normalize_phone_meta)
-- ============================================================================
-- Descrição: Trigger para normalizar telefones automaticamente quando
--            phone, additional_phones ou bio são atualizados.
--
-- IMPORTANTE: Esta migration usa a função normalize_phone_meta() da migration 059
--             que já valida DDDs brasileiros corretamente (11-99, exceto 10, 20, etc.)
--
-- Comportamento:
--   1. Coleta telefones de: phone, additional_phones, bio (regex)
--   2. Normaliza usando normalize_phone_meta() com validação de DDD
--   3. Prioriza telefone da bio (primeiro da lista)
--   4. Limita a 4 telefones únicos
--   5. Persiste em phones_normalized como JSONB array:
--      [{number: "+5511999999999", valid_whatsapp: null}, ...]
--
-- O campo valid_whatsapp é preenchido APENAS no momento do envio:
--   - null = não testado ainda
--   - true = confirmado como WhatsApp válido
--   - false = não é WhatsApp
-- ============================================================================

-- ============================================================================
-- 1. GARANTIR QUE normalize_phone_meta EXISTE (da migration 059)
-- ============================================================================

-- Se não existir, criar a função com validação de DDD correta
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

    -- Valida DDD brasileiro (11-99, onde ambos os dígitos são 1-9)
    -- Isso exclui DDDs inválidos como 10, 20, 30, 40, 50, 60, 70, 80, 90
    IF ddd !~ '^([1-9][1-9])$' THEN
        RETURN NULL;
    END IF;

    -- Extrai parte do número (após DDD)
    number_part := substring(cleaned from 3);

    -- Valida número (8 ou 9 dígitos)
    IF length(number_part) = 9 THEN
        -- Celular: deve começar com 9
        IF number_part !~ '^9' THEN
            RETURN NULL;
        END IF;
    ELSIF length(number_part) = 8 THEN
        -- Fixo: aceita qualquer início (2-5 é comum, mas há exceções)
        NULL;
    ELSE
        RETURN NULL;
    END IF;

    -- Retorna no formato E.164 brasileiro: +55DDNNNNNNNNN
    RETURN '+55' || cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 2. FUNÇÃO PARA EXTRAIR TELEFONES DA BIO
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_phones_from_bio(bio_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
    phones TEXT[] := '{}';
    matches TEXT[];
    phone TEXT;
    normalized TEXT;
BEGIN
    IF bio_text IS NULL OR bio_text = '' THEN
        RETURN phones;
    END IF;

    -- Padrões comuns de telefone brasileiro na bio
    -- Formato: (XX) XXXXX-XXXX, XX XXXXX-XXXX, XXXXXXXXXXX, +55...
    SELECT array_agg(m[1]) INTO matches
    FROM regexp_matches(
        bio_text,
        '(?:\+?55\s?)?(?:\(?0?[1-9][0-9]\)?[\s\-\.]?)?(?:9\s?)?[0-9]{4}[\s\-\.]?[0-9]{4}',
        'g'
    ) AS m;

    IF matches IS NOT NULL THEN
        FOREACH phone IN ARRAY matches LOOP
            normalized := normalize_phone_meta(phone);
            IF normalized IS NOT NULL AND NOT (normalized = ANY(phones)) THEN
                phones := array_append(phones, normalized);
            END IF;
        END LOOP;
    END IF;

    RETURN phones;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 3. FUNÇÃO PRINCIPAL: NORMALIZAR E ORGANIZAR TELEFONES
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_lead_phones()
RETURNS TRIGGER AS $$
DECLARE
    all_phones TEXT[] := '{}';
    bio_phones TEXT[];
    main_phone TEXT;
    add_phone TEXT;
    normalized TEXT;
    final_phones JSONB := '[]'::jsonb;
    phone_entry JSONB;
    existing_entry JSONB;
    i INTEGER;
BEGIN
    -- 1. EXTRAIR TELEFONES DA BIO (PRIORIDADE MÁXIMA)
    bio_phones := extract_phones_from_bio(NEW.bio);
    FOREACH normalized IN ARRAY bio_phones LOOP
        IF normalized IS NOT NULL AND NOT (normalized = ANY(all_phones)) THEN
            all_phones := array_append(all_phones, normalized);
        END IF;
    END LOOP;

    -- 2. TELEFONE PRINCIPAL (phone) - usa normalize_phone_meta com validação de DDD
    IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
        main_phone := normalize_phone_meta(NEW.phone);
        IF main_phone IS NOT NULL AND NOT (main_phone = ANY(all_phones)) THEN
            all_phones := array_append(all_phones, main_phone);
        END IF;
    END IF;

    -- 3. TELEFONES ADICIONAIS (additional_phones)
    IF NEW.additional_phones IS NOT NULL AND jsonb_array_length(NEW.additional_phones) > 0 THEN
        FOR i IN 0..jsonb_array_length(NEW.additional_phones) - 1 LOOP
            add_phone := NEW.additional_phones->>i;
            IF add_phone IS NOT NULL THEN
                normalized := normalize_phone_meta(add_phone);
                IF normalized IS NOT NULL AND NOT (normalized = ANY(all_phones)) THEN
                    all_phones := array_append(all_phones, normalized);
                END IF;
            END IF;

            -- Limitar a 4 telefones
            IF array_length(all_phones, 1) >= 4 THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- 4. CONSTRUIR JSONB COM STATUS DE VALIDAÇÃO
    -- Preservar valid_whatsapp existente se o número já estava na lista
    IF array_length(all_phones, 1) > 0 THEN
        FOR i IN 1..LEAST(array_length(all_phones, 1), 4) LOOP
            normalized := all_phones[i];

            -- Verificar se já existe no phones_normalized atual com status
            existing_entry := NULL;
            IF OLD IS NOT NULL AND OLD.phones_normalized IS NOT NULL THEN
                SELECT elem INTO existing_entry
                FROM jsonb_array_elements(OLD.phones_normalized) AS elem
                WHERE elem->>'number' = normalized
                LIMIT 1;
            END IF;

            IF existing_entry IS NOT NULL THEN
                -- Manter o status existente
                phone_entry := existing_entry;
            ELSE
                -- Novo telefone, status null (não testado)
                phone_entry := jsonb_build_object(
                    'number', normalized,
                    'valid_whatsapp', null
                );
            END IF;

            final_phones := final_phones || phone_entry;
        END LOOP;
    END IF;

    -- 5. ATUALIZAR phones_normalized
    NEW.phones_normalized := final_phones;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CRIAR TRIGGER
-- ============================================================================

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trg_normalize_phones ON instagram_leads;

-- Criar trigger BEFORE INSERT OR UPDATE
CREATE TRIGGER trg_normalize_phones
    BEFORE INSERT OR UPDATE OF phone, additional_phones, bio
    ON instagram_leads
    FOR EACH ROW
    EXECUTE FUNCTION normalize_lead_phones();

-- ============================================================================
-- 5. FUNÇÃO PARA ATUALIZAR STATUS DE VALIDAÇÃO (chamada pelo workflow)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_phone_whatsapp_status(
    p_lead_id UUID,
    p_phone TEXT,
    p_is_valid BOOLEAN
)
RETURNS TABLE (
    action TEXT,
    next_phone TEXT,
    phones_remaining INTEGER,
    should_switch_to_instagram BOOLEAN
) AS $$
DECLARE
    v_phones JSONB;
    v_updated_phones JSONB := '[]'::jsonb;
    v_phone_entry JSONB;
    v_found BOOLEAN := FALSE;
    v_next TEXT := NULL;
    v_untested_count INTEGER := 0;
    i INTEGER;
BEGIN
    -- Buscar phones_normalized atual
    SELECT phones_normalized INTO v_phones
    FROM instagram_leads
    WHERE id = p_lead_id;

    IF v_phones IS NULL OR jsonb_array_length(v_phones) = 0 THEN
        RETURN QUERY SELECT
            'no_phones'::TEXT,
            NULL::TEXT,
            0::INTEGER,
            TRUE::BOOLEAN;
        RETURN;
    END IF;

    -- Atualizar o status do telefone testado e encontrar próximo
    FOR i IN 0..jsonb_array_length(v_phones) - 1 LOOP
        v_phone_entry := v_phones->i;

        IF v_phone_entry->>'number' = p_phone THEN
            -- Atualizar status deste telefone
            v_phone_entry := jsonb_set(v_phone_entry, '{valid_whatsapp}', to_jsonb(p_is_valid));
            v_found := TRUE;
        ELSIF (v_phone_entry->>'valid_whatsapp') IS NULL THEN
            -- Telefone ainda não testado
            v_untested_count := v_untested_count + 1;
            IF v_next IS NULL AND NOT p_is_valid THEN
                -- Se o atual falhou, este é o próximo candidato
                v_next := v_phone_entry->>'number';
            END IF;
        ELSIF (v_phone_entry->>'valid_whatsapp')::boolean = TRUE THEN
            -- Já validado como WhatsApp
            v_untested_count := v_untested_count + 1; -- Conta como disponível
        END IF;

        v_updated_phones := v_updated_phones || v_phone_entry;
    END LOOP;

    -- Persistir atualização
    UPDATE instagram_leads
    SET phones_normalized = v_updated_phones,
        updated_at = NOW()
    WHERE id = p_lead_id;

    -- Determinar ação
    IF p_is_valid THEN
        -- Sucesso! Pode enviar
        RETURN QUERY SELECT
            'send'::TEXT,
            p_phone::TEXT,
            v_untested_count::INTEGER,
            FALSE::BOOLEAN;
    ELSIF v_next IS NOT NULL THEN
        -- Falhou, mas tem próximo para tentar
        RETURN QUERY SELECT
            'try_next'::TEXT,
            v_next::TEXT,
            v_untested_count::INTEGER,
            FALSE::BOOLEAN;
    ELSE
        -- Falhou e não tem mais telefones, mudar para Instagram
        RETURN QUERY SELECT
            'switch_to_instagram'::TEXT,
            NULL::TEXT,
            0::INTEGER,
            TRUE::BOOLEAN;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNÇÃO PARA OBTER PRÓXIMO TELEFONE NÃO TESTADO
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_untested_phone(p_lead_id UUID)
RETURNS TABLE (
    phone TEXT,
    phones_total INTEGER,
    phones_untested INTEGER
) AS $$
DECLARE
    v_phones JSONB;
    v_phone_entry JSONB;
    v_next TEXT := NULL;
    v_total INTEGER := 0;
    v_untested INTEGER := 0;
    i INTEGER;
BEGIN
    SELECT phones_normalized INTO v_phones
    FROM instagram_leads
    WHERE id = p_lead_id;

    IF v_phones IS NOT NULL THEN
        v_total := jsonb_array_length(v_phones);

        FOR i IN 0..v_total - 1 LOOP
            v_phone_entry := v_phones->i;

            -- Contar não testados ou válidos
            IF (v_phone_entry->>'valid_whatsapp') IS NULL THEN
                v_untested := v_untested + 1;
                IF v_next IS NULL THEN
                    v_next := v_phone_entry->>'number';
                END IF;
            ELSIF (v_phone_entry->>'valid_whatsapp')::boolean = TRUE THEN
                -- Já validado, usar este
                IF v_next IS NULL THEN
                    v_next := v_phone_entry->>'number';
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN QUERY SELECT v_next, v_total, v_untested;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. COMENTÁRIOS
-- ============================================================================

COMMENT ON FUNCTION normalize_phone_meta IS
'Normaliza telefone brasileiro para formato E.164 (+55DDNNNNNNNNN).
Valida DDDs brasileiros (11-99, excluindo 10, 20, 30, etc.).
Valida formato de celular (9 dígitos começando com 9) e fixo (8 dígitos).';

COMMENT ON FUNCTION extract_phones_from_bio IS
'Extrai números de telefone de texto livre (bio do Instagram) usando regex';

COMMENT ON FUNCTION normalize_lead_phones IS
'Trigger function que normaliza telefones quando phone, additional_phones ou bio são atualizados.
Usa normalize_phone_meta() para validação de DDD.';

COMMENT ON FUNCTION update_phone_whatsapp_status IS
'Atualiza status valid_whatsapp após tentativa de envio. Retorna próxima ação (send, try_next, switch_to_instagram)';

COMMENT ON FUNCTION get_next_untested_phone IS
'Retorna próximo telefone não testado ou já validado para um lead';

COMMENT ON TRIGGER trg_normalize_phones ON instagram_leads IS
'Trigger que normaliza telefones automaticamente. Prioriza: 1) Bio, 2) phone, 3) additional_phones. Máximo 4 telefones.
Usa normalize_phone_meta() com validação de DDD brasileiro.';

-- ============================================================================
-- 8. MIGRAR DADOS EXISTENTES
-- ============================================================================

-- Re-normalizar todos os leads que têm telefone usando a função corrigida
UPDATE instagram_leads
SET
    phones_normalized = (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'number', normalized_phone,
                    'valid_whatsapp', null
                )
            ),
            '[]'::jsonb
        )
        FROM (
            SELECT DISTINCT normalized_phone
            FROM (
                -- Telefone principal
                SELECT normalize_phone_meta(phone) as normalized_phone
                WHERE phone IS NOT NULL AND phone != ''

                UNION

                -- Telefones adicionais
                SELECT normalize_phone_meta(phone_value)
                FROM jsonb_array_elements_text(COALESCE(additional_phones, '[]'::jsonb)) AS phone_value
                WHERE phone_value IS NOT NULL AND phone_value != ''

                -- Bio phones são extraídos pelo trigger automaticamente
            ) phones
            WHERE normalized_phone IS NOT NULL
            LIMIT 4
        ) unique_phones
    ),
    updated_at = NOW()
WHERE phone IS NOT NULL
   OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0);

-- ============================================================================
-- 9. ESTATÍSTICAS PÓS-MIGRAÇÃO
-- ============================================================================

-- Verificar resultado da normalização
SELECT
    'Resultado da Normalização' as info,
    COUNT(*) as total_leads,
    COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as leads_com_phone_original,
    COUNT(CASE WHEN jsonb_array_length(phones_normalized) > 0 THEN 1 END) as leads_com_phones_normalized,
    ROUND(
        COUNT(CASE WHEN jsonb_array_length(phones_normalized) > 0 THEN 1 END)::NUMERIC /
        NULLIF(COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END), 0) * 100,
        2
    ) as taxa_normalizacao_pct
FROM instagram_leads;

