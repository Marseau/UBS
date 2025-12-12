-- ============================================================================
-- MIGRATION 077: Handle Phone Failure Function (Anti-Ban Strategy)
-- ============================================================================
-- Descrição: Função para tratar falha de telefone WhatsApp com estratégia anti-ban.
--
-- Comportamento:
--   1. Marca o telefone como valid_whatsapp: false em phones_normalized
--   2. Se há mais telefones não testados: muda status para 'pending_retry' (final da fila)
--   3. Se não há mais telefones: muda outreach_channel para 'instagram'
--
-- IMPORTANTE: NUNCA tenta 2 telefones do mesmo lead em sequência!
-- O lead vai para o final da fila e só será processado novamente quando
-- todos os outros leads pendentes forem tentados.
-- ============================================================================

-- ============================================================================
-- 1. FUNÇÃO PRINCIPAL: HANDLE_PHONE_FAILURE
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_phone_failure(
    p_lead_id UUID,
    p_campaign_lead_id UUID DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
    action TEXT,
    has_more_phones BOOLEAN,
    phones_remaining INTEGER
) AS $$
DECLARE
    v_phones JSONB;
    v_updated_phones JSONB := '[]'::jsonb;
    v_phone_entry JSONB;
    v_untested_count INTEGER := 0;
    v_found BOOLEAN := FALSE;
    i INTEGER;
BEGIN
    -- 1. Buscar phones_normalized atual do lead
    SELECT phones_normalized INTO v_phones
    FROM instagram_leads
    WHERE id = p_lead_id;

    IF v_phones IS NULL OR jsonb_array_length(v_phones) = 0 THEN
        -- Sem telefones, ir direto para Instagram
        IF p_campaign_lead_id IS NOT NULL THEN
            UPDATE campaign_leads
            SET outreach_channel = 'instagram',
                status = 'pending',
                updated_at = NOW()
            WHERE id = p_campaign_lead_id;
        END IF;

        RETURN QUERY SELECT
            'switch_to_instagram'::TEXT,
            FALSE::BOOLEAN,
            0::INTEGER;
        RETURN;
    END IF;

    -- 2. Atualizar o status do telefone que falhou e contar não testados
    FOR i IN 0..jsonb_array_length(v_phones) - 1 LOOP
        v_phone_entry := v_phones->i;

        -- Se é o telefone que falhou, marcar como inválido
        IF p_phone IS NOT NULL AND v_phone_entry->>'number' = p_phone THEN
            v_phone_entry := jsonb_set(v_phone_entry, '{valid_whatsapp}', 'false'::jsonb);
            v_found := TRUE;
        ELSIF (v_phone_entry->>'valid_whatsapp') IS NULL THEN
            -- Telefone ainda não testado
            v_untested_count := v_untested_count + 1;
        END IF;

        v_updated_phones := v_updated_phones || v_phone_entry;
    END LOOP;

    -- 3. Persistir atualização em instagram_leads
    UPDATE instagram_leads
    SET phones_normalized = v_updated_phones,
        updated_at = NOW()
    WHERE id = p_lead_id;

    -- 4. Determinar ação e atualizar campaign_leads
    IF v_untested_count > 0 THEN
        -- Ainda tem telefones para tentar, vai para o final da fila
        IF p_campaign_lead_id IS NOT NULL THEN
            UPDATE campaign_leads
            SET status = 'pending_retry',
                updated_at = NOW()
            WHERE id = p_campaign_lead_id;
        END IF;

        RETURN QUERY SELECT
            'pending_retry'::TEXT,
            TRUE::BOOLEAN,
            v_untested_count::INTEGER;
    ELSE
        -- Todos os telefones testados e falharam, mudar para Instagram
        IF p_campaign_lead_id IS NOT NULL THEN
            UPDATE campaign_leads
            SET outreach_channel = 'instagram',
                status = 'pending',
                updated_at = NOW()
            WHERE id = p_campaign_lead_id;
        END IF;

        RETURN QUERY SELECT
            'switch_to_instagram'::TEXT,
            FALSE::BOOLEAN,
            0::INTEGER;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. COMENTÁRIO
-- ============================================================================

COMMENT ON FUNCTION handle_phone_failure IS
'Trata falha de telefone WhatsApp com estratégia anti-ban:
- Marca telefone como inválido (valid_whatsapp: false)
- Se há mais telefones: status = pending_retry (final da fila)
- Se não há mais: muda canal para Instagram
NUNCA tenta 2 telefones do mesmo lead em sequência!';

-- ============================================================================
-- 3. GARANTIR QUE STATUS pending_retry EXISTE
-- ============================================================================

-- Se a coluna status for um enum, adicionar o valor
-- (Se for text, não precisa fazer nada)
DO $$
BEGIN
    -- Verificar se é enum e adicionar valor se necessário
    IF EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'campaign_lead_status'
    ) THEN
        BEGIN
            ALTER TYPE campaign_lead_status ADD VALUE IF NOT EXISTS 'pending_retry';
        EXCEPTION WHEN duplicate_object THEN
            NULL; -- já existe
        END;
    END IF;
END $$;
