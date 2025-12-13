-- Migration 074: Distribuição de canais de outreach (60% WA, 40% IG)
-- Data: 2025-12-11
-- Objetivo: Implementar distribuição 60% WhatsApp / 40% Instagram baseada em fit_score

-- ============================================================================
-- FUNÇÃO: Distribui leads entre canais (60% WA dos que têm telefone, resto IG)
--
-- Lógica:
-- 1. Ordenar leads por fit_score DESC (mais quentes primeiro)
-- 2. Dos que têm telefone, pegar os primeiros 60% → WhatsApp
-- 3. O restante (40% com telefone + todos sem telefone) → Instagram
-- ============================================================================

CREATE OR REPLACE FUNCTION distribute_outreach_channels(
    p_campaign_id UUID
) RETURNS TABLE (
    total_leads INTEGER,
    whatsapp_count INTEGER,
    instagram_count INTEGER
) AS $$
DECLARE
    v_total_leads INTEGER;
    v_leads_with_phone INTEGER;
    v_whatsapp_limit INTEGER;
    v_whatsapp_assigned INTEGER := 0;
    v_instagram_assigned INTEGER := 0;
BEGIN
    -- Contar total de leads e leads com telefone
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE il.phone IS NOT NULL AND il.phone != '')
    INTO v_total_leads, v_leads_with_phone
    FROM campaign_leads cl
    INNER JOIN instagram_leads il ON il.id = cl.lead_id
    WHERE cl.campaign_id = p_campaign_id
    AND cl.status = 'pending';

    -- Calcular limite de WhatsApp (60% dos que têm telefone)
    v_whatsapp_limit := CEIL(v_leads_with_phone * 0.6);

    -- Atribuir WhatsApp aos primeiros 60% com telefone (ordenados por fit_score)
    WITH ranked_leads AS (
        SELECT
            cl.id,
            cl.lead_id,
            il.phone,
            cl.fit_score,
            ROW_NUMBER() OVER (
                PARTITION BY (il.phone IS NOT NULL AND il.phone != '')
                ORDER BY cl.fit_score DESC
            ) as rank_in_group
        FROM campaign_leads cl
        INNER JOIN instagram_leads il ON il.id = cl.lead_id
        WHERE cl.campaign_id = p_campaign_id
        AND cl.status = 'pending'
    )
    UPDATE campaign_leads cl
    SET outreach_channel = CASE
        WHEN rl.phone IS NOT NULL AND rl.phone != '' AND rl.rank_in_group <= v_whatsapp_limit
        THEN 'whatsapp'
        ELSE 'instagram'
    END
    FROM ranked_leads rl
    WHERE cl.id = rl.id;

    -- Contar resultados
    SELECT
        COUNT(*) FILTER (WHERE outreach_channel = 'whatsapp'),
        COUNT(*) FILTER (WHERE outreach_channel = 'instagram')
    INTO v_whatsapp_assigned, v_instagram_assigned
    FROM campaign_leads
    WHERE campaign_id = p_campaign_id;

    RETURN QUERY SELECT v_total_leads, v_whatsapp_assigned, v_instagram_assigned;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Adicionar coluna outreach_channel em campaign_leads se não existir
-- ============================================================================
ALTER TABLE campaign_leads
ADD COLUMN IF NOT EXISTS outreach_channel VARCHAR(20) DEFAULT 'instagram'
CHECK (outreach_channel IN ('whatsapp', 'instagram'));

-- Índice para consultas por canal
CREATE INDEX IF NOT EXISTS idx_campaign_leads_channel
ON campaign_leads(campaign_id, outreach_channel);

-- ============================================================================
-- VIEW: Leads prontos para outreach ordenados por fit_score
-- ============================================================================
CREATE OR REPLACE VIEW v_campaign_leads_for_outreach AS
SELECT
    cl.id,
    cl.campaign_id,
    cl.lead_id,
    cl.subcluster_id,
    cl.fit_score,
    cl.outreach_channel,
    cl.status,
    il.username,
    il.full_name,
    il.phone,
    il.bio,
    il.followers_count,
    cs.cluster_name,
    cs.persona,
    cs.dm_scripts
FROM campaign_leads cl
INNER JOIN instagram_leads il ON il.id = cl.lead_id
LEFT JOIN campaign_subclusters cs ON cs.id = cl.subcluster_id
WHERE cl.status = 'pending'
ORDER BY cl.fit_score DESC;

-- ============================================================================
-- FUNÇÃO: Obter próximo batch de leads para outreach por canal
-- ============================================================================
CREATE OR REPLACE FUNCTION get_outreach_batch_by_channel(
    p_campaign_id UUID,
    p_channel VARCHAR,
    p_batch_size INTEGER DEFAULT 50
) RETURNS TABLE (
    lead_id UUID,
    username VARCHAR,
    full_name TEXT,
    phone VARCHAR,
    bio TEXT,
    fit_score FLOAT,
    cluster_name VARCHAR,
    dm_script JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cl.lead_id,
        il.username,
        il.full_name,
        il.phone,
        il.bio,
        cl.fit_score,
        cs.cluster_name,
        CASE
            WHEN p_channel = 'whatsapp' THEN cs.dm_scripts->'whatsapp'->0
            ELSE cs.dm_scripts->'instagram'->0
        END as dm_script
    FROM campaign_leads cl
    INNER JOIN instagram_leads il ON il.id = cl.lead_id
    LEFT JOIN campaign_subclusters cs ON cs.id = cl.subcluster_id
    WHERE cl.campaign_id = p_campaign_id
    AND cl.outreach_channel = p_channel
    AND cl.status = 'pending'
    ORDER BY cl.fit_score DESC
    LIMIT p_batch_size;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comentários
-- ============================================================================
COMMENT ON FUNCTION distribute_outreach_channels IS
'Distribui leads entre WhatsApp (60% dos que têm telefone, mais quentes) e Instagram (resto).
Ordenação por fit_score garante que leads mais quentes vão para WhatsApp.';

COMMENT ON FUNCTION get_outreach_batch_by_channel IS
'Retorna próximo batch de leads para outreach em um canal específico, ordenados por fit_score DESC.';

COMMENT ON COLUMN campaign_leads.outreach_channel IS
'Canal designado para outreach: whatsapp (60% dos com telefone) ou instagram (40% + sem telefone)';
