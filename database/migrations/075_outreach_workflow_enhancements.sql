-- ============================================================================
-- MIGRATION 075: Outreach Workflow Enhancements
-- ============================================================================
-- Descrição: Melhorias no sistema de outreach para suportar:
--   1. Round-Robin de campanhas
--   2. Validação de número WhatsApp
--   3. Fallback para telefones adicionais
--   4. Mudança automática para Instagram
--   5. Verificação de conclusão de campanha
-- ============================================================================

-- ============================================================================
-- 1. NOVOS STATUS PARA cluster_campaigns.pipeline_status
-- ============================================================================

-- Adicionar novos valores ao CHECK constraint
ALTER TABLE cluster_campaigns
DROP CONSTRAINT IF EXISTS cluster_campaigns_pipeline_status_check;

ALTER TABLE cluster_campaigns
ADD CONSTRAINT cluster_campaigns_pipeline_status_check
CHECK (pipeline_status IN (
    'draft',                    -- Rascunho
    'collecting_leads',         -- Coletando leads
    'clustering',               -- Processando clusters
    'generating_personas',      -- Gerando personas
    'ready_for_outreach',       -- Pronta para envio
    'outreach_in_progress',     -- Enviando (tem leads pendentes)
    'outreach_paused',          -- Pausada manualmente
    'outreach_completed',       -- Todos os leads processados
    'archived'                  -- Arquivada
));

-- ============================================================================
-- 2. NOVOS STATUS PARA campaign_leads.status
-- ============================================================================

ALTER TABLE campaign_leads
DROP CONSTRAINT IF EXISTS campaign_leads_status_check;

ALTER TABLE campaign_leads
ADD CONSTRAINT campaign_leads_status_check
CHECK (status IN (
    'pending',                  -- Aguardando processamento
    'outreach_queued',          -- Na fila de envio
    'validating_phone',         -- Validando número WhatsApp
    'phone_invalid',            -- Número não é WhatsApp
    'phone_fallback',           -- Testando telefone adicional
    'channel_changed',          -- Canal mudou de WA para IG
    'sent',                     -- Mensagem enviada
    'delivered',                -- Mensagem entregue
    'read',                     -- Mensagem lida
    'replied',                  -- Lead respondeu
    'converted',                -- Lead converteu
    'failed',                   -- Falha no envio
    'blocked',                  -- Bloqueado/não aceita DM
    'rejected',                 -- Rejeitado manualmente
    'removed'                   -- Removido da campanha
));

-- ============================================================================
-- 3. CAMPO PARA TRACKING DE TENTATIVAS DE TELEFONE
-- ============================================================================

ALTER TABLE campaign_leads
ADD COLUMN IF NOT EXISTS phone_attempts JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN campaign_leads.phone_attempts IS
'Array de tentativas de validação de telefone: [{"phone": "5511...", "valid": false, "checked_at": "..."}]';

-- ============================================================================
-- 4. CAMPO PARA CONTAGEM DE ENVIOS POR CAMPANHA (para Round-Robin)
-- ============================================================================

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS outreach_sent_today INTEGER DEFAULT 0;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS outreach_sent_total INTEGER DEFAULT 0;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS outreach_last_sent_at TIMESTAMP WITH TIME ZONE;

-- Reset diário do contador
CREATE OR REPLACE FUNCTION reset_daily_outreach_counters()
RETURNS void AS $$
BEGIN
    UPDATE cluster_campaigns
    SET outreach_sent_today = 0
    WHERE outreach_sent_today > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNÇÃO: Selecionar próxima campanha (Round-Robin)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_campaign_round_robin()
RETURNS TABLE (
    campaign_id UUID,
    campaign_name VARCHAR,
    pending_leads_whatsapp INTEGER,
    pending_leads_instagram INTEGER,
    sent_today INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as campaign_id,
        c.campaign_name,
        (SELECT COUNT(*)::INTEGER FROM campaign_leads cl
         WHERE cl.campaign_id = c.id
         AND cl.outreach_channel = 'whatsapp'
         AND cl.status = 'pending') as pending_leads_whatsapp,
        (SELECT COUNT(*)::INTEGER FROM campaign_leads cl
         WHERE cl.campaign_id = c.id
         AND cl.outreach_channel = 'instagram'
         AND cl.status = 'pending') as pending_leads_instagram,
        c.outreach_sent_today as sent_today
    FROM cluster_campaigns c
    WHERE c.pipeline_status IN ('ready_for_outreach', 'outreach_in_progress')
    AND EXISTS (
        SELECT 1 FROM campaign_leads cl
        WHERE cl.campaign_id = c.id
        AND cl.status = 'pending'
    )
    ORDER BY
        c.outreach_sent_today ASC,           -- Menos envios hoje primeiro
        c.outreach_last_sent_at ASC NULLS FIRST  -- Mais tempo sem enviar primeiro
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNÇÃO: Verificar se campanha está completa
-- ============================================================================

CREATE OR REPLACE FUNCTION check_campaign_completion(p_campaign_id UUID)
RETURNS TABLE (
    is_complete BOOLEAN,
    total_leads INTEGER,
    pending_leads INTEGER,
    sent_leads INTEGER,
    failed_leads INTEGER,
    converted_leads INTEGER
) AS $$
DECLARE
    v_total INTEGER;
    v_pending INTEGER;
    v_sent INTEGER;
    v_failed INTEGER;
    v_converted INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read', 'replied')),
        COUNT(*) FILTER (WHERE status IN ('failed', 'blocked', 'phone_invalid')),
        COUNT(*) FILTER (WHERE status = 'converted')
    INTO v_total, v_pending, v_sent, v_failed, v_converted
    FROM campaign_leads
    WHERE campaign_id = p_campaign_id;

    -- Se não tem mais leads pendentes, marcar como completa
    IF v_pending = 0 AND v_total > 0 THEN
        UPDATE cluster_campaigns
        SET pipeline_status = 'outreach_completed',
            updated_at = NOW()
        WHERE id = p_campaign_id
        AND pipeline_status != 'outreach_completed';
    END IF;

    RETURN QUERY SELECT
        (v_pending = 0 AND v_total > 0) as is_complete,
        v_total,
        v_pending,
        v_sent,
        v_failed,
        v_converted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNÇÃO: Registrar tentativa de telefone e fazer fallback
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_phone_validation_result(
    p_campaign_lead_id UUID,
    p_phone VARCHAR,
    p_is_valid BOOLEAN
)
RETURNS TABLE (
    action VARCHAR,
    next_phone VARCHAR,
    new_channel VARCHAR
) AS $$
DECLARE
    v_lead RECORD;
    v_attempts JSONB;
    v_additional_phones JSONB;
    v_next_phone VARCHAR;
    v_tested_phones TEXT[];
BEGIN
    -- Buscar lead
    SELECT cl.*, il.additional_phones, il.username as instagram_username
    INTO v_lead
    FROM campaign_leads cl
    JOIN instagram_leads il ON il.id = cl.lead_id
    WHERE cl.id = p_campaign_lead_id;

    -- Adicionar tentativa ao histórico
    v_attempts := COALESCE(v_lead.phone_attempts, '[]'::jsonb);
    v_attempts := v_attempts || jsonb_build_object(
        'phone', p_phone,
        'valid', p_is_valid,
        'checked_at', NOW()
    );

    -- Se válido, retornar sucesso
    IF p_is_valid THEN
        UPDATE campaign_leads
        SET phone_attempts = v_attempts,
            status = 'outreach_queued',
            updated_at = NOW()
        WHERE id = p_campaign_lead_id;

        RETURN QUERY SELECT 'proceed'::VARCHAR, p_phone, 'whatsapp'::VARCHAR;
        RETURN;
    END IF;

    -- Coletar telefones já testados
    SELECT array_agg(attempt->>'phone')
    INTO v_tested_phones
    FROM jsonb_array_elements(v_attempts) as attempt;

    -- Buscar próximo telefone não testado
    v_additional_phones := COALESCE(v_lead.additional_phones, '[]'::jsonb);

    SELECT phone INTO v_next_phone
    FROM jsonb_array_elements_text(v_additional_phones) as phone
    WHERE phone NOT IN (SELECT unnest(v_tested_phones))
    LIMIT 1;

    -- Se tem outro telefone, tentar
    IF v_next_phone IS NOT NULL THEN
        UPDATE campaign_leads
        SET phone_attempts = v_attempts,
            status = 'phone_fallback',
            updated_at = NOW()
        WHERE id = p_campaign_lead_id;

        RETURN QUERY SELECT 'try_next_phone'::VARCHAR, v_next_phone, 'whatsapp'::VARCHAR;
        RETURN;
    END IF;

    -- Sem mais telefones, mudar para Instagram
    IF v_lead.instagram_username IS NOT NULL AND v_lead.instagram_username != '' THEN
        UPDATE campaign_leads
        SET phone_attempts = v_attempts,
            status = 'channel_changed',
            outreach_channel = 'instagram',
            updated_at = NOW()
        WHERE id = p_campaign_lead_id;

        RETURN QUERY SELECT 'change_to_instagram'::VARCHAR, NULL::VARCHAR, 'instagram'::VARCHAR;
        RETURN;
    END IF;

    -- Sem opções, marcar como falha
    UPDATE campaign_leads
    SET phone_attempts = v_attempts,
        status = 'phone_invalid',
        updated_at = NOW()
    WHERE id = p_campaign_lead_id;

    RETURN QUERY SELECT 'no_valid_channel'::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNÇÃO: Incrementar contador de envios da campanha
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_campaign_send_count(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE cluster_campaigns
    SET
        outreach_sent_today = outreach_sent_today + 1,
        outreach_sent_total = outreach_sent_total + 1,
        outreach_last_sent_at = NOW(),
        pipeline_status = CASE
            WHEN pipeline_status = 'ready_for_outreach' THEN 'outreach_in_progress'
            ELSE pipeline_status
        END,
        updated_at = NOW()
    WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. VIEW: Status de outreach por campanha
-- ============================================================================

CREATE OR REPLACE VIEW v_campaign_outreach_status AS
SELECT
    c.id as campaign_id,
    c.campaign_name,
    c.pipeline_status,
    c.outreach_sent_today,
    c.outreach_sent_total,
    c.outreach_last_sent_at,
    COUNT(cl.id) as total_leads,
    COUNT(*) FILTER (WHERE cl.status = 'pending') as pending,
    COUNT(*) FILTER (WHERE cl.status = 'outreach_queued') as queued,
    COUNT(*) FILTER (WHERE cl.status IN ('sent', 'delivered', 'read')) as sent,
    COUNT(*) FILTER (WHERE cl.status = 'replied') as replied,
    COUNT(*) FILTER (WHERE cl.status = 'converted') as converted,
    COUNT(*) FILTER (WHERE cl.status IN ('failed', 'blocked', 'phone_invalid')) as failed,
    COUNT(*) FILTER (WHERE cl.outreach_channel = 'whatsapp') as channel_whatsapp,
    COUNT(*) FILTER (WHERE cl.outreach_channel = 'instagram') as channel_instagram
FROM cluster_campaigns c
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
WHERE c.pipeline_status IN ('ready_for_outreach', 'outreach_in_progress', 'outreach_completed')
GROUP BY c.id, c.campaign_name, c.pipeline_status, c.outreach_sent_today,
         c.outreach_sent_total, c.outreach_last_sent_at
ORDER BY c.outreach_last_sent_at DESC NULLS LAST;

-- ============================================================================
-- 10. ÍNDICES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_campaign_leads_outreach_pending
ON campaign_leads(campaign_id, outreach_channel)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_campaigns_outreach_active
ON cluster_campaigns(outreach_sent_today, outreach_last_sent_at)
WHERE pipeline_status IN ('ready_for_outreach', 'outreach_in_progress');

-- ============================================================================
-- COMENTÁRIOS
-- ============================================================================

COMMENT ON FUNCTION get_next_campaign_round_robin IS
'Seleciona a próxima campanha para outreach usando Round-Robin baseado em envios do dia';

COMMENT ON FUNCTION check_campaign_completion IS
'Verifica se todos os leads de uma campanha foram processados e marca como completa';

COMMENT ON FUNCTION handle_phone_validation_result IS
'Processa resultado da validação de telefone WhatsApp com fallback para telefones adicionais e Instagram';

COMMENT ON FUNCTION increment_campaign_send_count IS
'Incrementa contadores de envio da campanha após cada mensagem enviada';
