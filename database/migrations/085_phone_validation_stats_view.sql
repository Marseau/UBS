-- ============================================================================
-- MIGRATION 085: Phone Validation Stats View
-- ============================================================================
-- Descrição: View para estatísticas de validação de números WhatsApp por campanha
-- ============================================================================

-- View para estatísticas de validação de números por campanha
CREATE OR REPLACE VIEW v_campaign_phone_validation_stats AS
WITH phone_stats AS (
  SELECT
    cl.campaign_id,
    cl.lead_id,
    cl.outreach_channel,
    -- Contar números por status de validação
    (SELECT COUNT(*) FROM jsonb_array_elements(il.phones_normalized) elem
     WHERE elem->>'valid_whatsapp' = 'true') as valid_whatsapp_count,
    (SELECT COUNT(*) FROM jsonb_array_elements(il.phones_normalized) elem
     WHERE elem->>'valid_whatsapp' = 'false') as invalid_whatsapp_count,
    (SELECT COUNT(*) FROM jsonb_array_elements(il.phones_normalized) elem
     WHERE (elem->>'valid_whatsapp') IS NULL OR elem->>'valid_whatsapp' = 'null') as pending_validation_count,
    COALESCE(jsonb_array_length(il.phones_normalized), 0) as total_phones
  FROM campaign_leads cl
  JOIN instagram_leads il ON il.id = cl.lead_id
  WHERE cl.status != 'removed'
)
SELECT
  cc.id as campaign_id,
  cc.campaign_name,
  cc.pipeline_status,

  -- Total de leads
  COUNT(DISTINCT ps.lead_id) as total_leads,

  -- Leads com telefone
  COUNT(DISTINCT ps.lead_id) FILTER (WHERE ps.total_phones > 0) as leads_with_phone,

  -- Leads sem telefone (só Instagram)
  COUNT(DISTINCT ps.lead_id) FILTER (WHERE ps.total_phones = 0) as leads_without_phone,

  -- Validação de números
  COALESCE(SUM(ps.valid_whatsapp_count), 0) as total_valid_whatsapp,
  COALESCE(SUM(ps.invalid_whatsapp_count), 0) as total_invalid_whatsapp,
  COALESCE(SUM(ps.pending_validation_count), 0) as total_pending_validation,
  COALESCE(SUM(ps.total_phones), 0) as total_phone_numbers,

  -- Leads por canal definido
  COUNT(DISTINCT ps.lead_id) FILTER (WHERE ps.outreach_channel = 'whatsapp') as leads_channel_whatsapp,
  COUNT(DISTINCT ps.lead_id) FILTER (WHERE ps.outreach_channel = 'instagram') as leads_channel_instagram,
  COUNT(DISTINCT ps.lead_id) FILTER (WHERE ps.outreach_channel IS NULL) as leads_channel_undefined,

  -- Percentuais
  ROUND(
    100.0 * COUNT(DISTINCT ps.lead_id) FILTER (WHERE ps.total_phones > 0) /
    NULLIF(COUNT(DISTINCT ps.lead_id), 0), 1
  ) as pct_with_phone,

  ROUND(
    100.0 * COALESCE(SUM(ps.valid_whatsapp_count), 0) /
    NULLIF(COALESCE(SUM(ps.total_phones), 0), 0), 1
  ) as pct_valid_whatsapp,

  -- Progresso da validação (% de números já verificados)
  ROUND(
    100.0 * (COALESCE(SUM(ps.valid_whatsapp_count), 0) + COALESCE(SUM(ps.invalid_whatsapp_count), 0)) /
    NULLIF(COALESCE(SUM(ps.total_phones), 0), 0), 1
  ) as pct_validation_complete

FROM cluster_campaigns cc
LEFT JOIN phone_stats ps ON ps.campaign_id = cc.id
GROUP BY cc.id, cc.campaign_name, cc.pipeline_status
ORDER BY cc.created_at DESC;

-- Comentário
COMMENT ON VIEW v_campaign_phone_validation_stats IS
'Estatísticas de validação de números WhatsApp por campanha. Mostra progresso de validação e distribuição de canais.';

-- ============================================================================
-- FUNÇÃO: Obter estatísticas de validação de uma campanha específica
-- ============================================================================
CREATE OR REPLACE FUNCTION get_campaign_validation_stats(p_campaign_id UUID)
RETURNS TABLE (
  campaign_name VARCHAR,
  total_leads INTEGER,
  leads_with_phone INTEGER,
  leads_without_phone INTEGER,
  total_valid_whatsapp BIGINT,
  total_invalid_whatsapp BIGINT,
  total_pending_validation BIGINT,
  leads_channel_whatsapp INTEGER,
  leads_channel_instagram INTEGER,
  pct_validation_complete NUMERIC,
  remaining_to_validate BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.campaign_name::VARCHAR,
    v.total_leads::INTEGER,
    v.leads_with_phone::INTEGER,
    v.leads_without_phone::INTEGER,
    v.total_valid_whatsapp,
    v.total_invalid_whatsapp,
    v.total_pending_validation,
    v.leads_channel_whatsapp::INTEGER,
    v.leads_channel_instagram::INTEGER,
    COALESCE(v.pct_validation_complete, 0) as pct_validation_complete,
    v.total_pending_validation as remaining_to_validate
  FROM v_campaign_phone_validation_stats v
  WHERE v.campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_campaign_validation_stats IS
'Retorna estatísticas detalhadas de validação de números para uma campanha específica';
