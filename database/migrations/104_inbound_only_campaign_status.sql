-- =====================================================
-- Migration 104: Status inbound_only para campanhas
-- =====================================================
-- Permite campanhas que respondem inbound (LP, WhatsApp)
-- mas NÃO fazem outreach (cold DMs, follows, unfollows)
--
-- Casos de uso:
-- - Campanha institucional da AIC
-- - Campanhas de clientes que só querem inbound
-- - Testes de AI Agent sem disparar outreach
-- =====================================================

-- 1. Adicionar novo valor ao enum campaign_status
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'inbound_only' AFTER 'active';

-- 2. Atualizar resolve_campaign_from_contact para incluir inbound_only
-- Esta função resolve qual campanha deve responder a uma mensagem inbound
CREATE OR REPLACE FUNCTION public.resolve_campaign_from_contact(p_phone text, p_channel_id text)
RETURNS TABLE(
  resolved_campaign_id uuid,
  resolved_campaign_name text,
  source text,
  consultant_phone text,
  consultant_name text,
  test_mode boolean,
  campaign_status text,
  test_whatsapp_number text,
  whapi_channel_token text
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_phone_normalized TEXT;
BEGIN
  v_phone_normalized := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- 1. Tentar resolver por channel_id (Whapi)
  IF p_channel_id IS NOT NULL AND p_channel_id != '' THEN
    RETURN QUERY
    SELECT
      cc.id,
      cc.campaign_name::TEXT,
      'whapi_channel'::TEXT,
      cc.consultant_phone::TEXT,
      cc.consultant_name::TEXT,
      cc.status = 'test' AS test_mode,
      cc.status::TEXT AS campaign_status,
      COALESCE(cc.test_whatsapp_number, '5511999040605')::TEXT,
      wc.api_token::TEXT AS whapi_channel_token
    FROM cluster_campaigns cc
    JOIN whapi_channels wc ON wc.id = cc.whapi_channel_uuid
    WHERE wc.channel_id = p_channel_id
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Tentar resolver por lead (whatsapp_number)
  RETURN QUERY
  SELECT
    cc.id,
    cc.campaign_name::TEXT,
    'campaign_lead'::TEXT,
    cc.consultant_phone::TEXT,
    cc.consultant_name::TEXT,
    cc.status = 'test' AS test_mode,
    cc.status::TEXT AS campaign_status,
    COALESCE(cc.test_whatsapp_number, '5511999040605')::TEXT,
    wc.api_token::TEXT AS whapi_channel_token
  FROM campaign_leads cl
  JOIN instagram_leads il ON il.id = cl.lead_id
  JOIN cluster_campaigns cc ON cc.id = cl.campaign_id
  LEFT JOIN whapi_channels wc ON wc.id = cc.whapi_channel_uuid
  WHERE il.whatsapp_number LIKE '%' || RIGHT(v_phone_normalized, 11) || '%'
  ORDER BY cl.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 3. Fallback: campanha ativa, em teste ou inbound_only
  -- ATUALIZADO: incluir inbound_only como status válido para inbound
  RETURN QUERY
  SELECT
    cc.id,
    cc.campaign_name::TEXT,
    'default'::TEXT,
    cc.consultant_phone::TEXT,
    cc.consultant_name::TEXT,
    cc.status = 'test' AS test_mode,
    cc.status::TEXT AS campaign_status,
    COALESCE(cc.test_whatsapp_number, '5511999040605')::TEXT,
    wc.api_token::TEXT AS whapi_channel_token
  FROM cluster_campaigns cc
  LEFT JOIN whapi_channels wc ON wc.id = cc.whapi_channel_uuid
  WHERE cc.status IN ('active', 'test', 'inbound_only')
  ORDER BY cc.created_at DESC LIMIT 1;
END;
$function$;

-- 3. Atualizar get_campaign_status para incluir inbound_only
CREATE OR REPLACE FUNCTION public.get_campaign_status(p_campaign_id uuid)
RETURNS TABLE(
  status campaign_status,
  is_test_mode boolean,
  can_send_outreach boolean,
  status_label text
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cc.status,
    cc.status = 'test' AS is_test_mode,
    -- inbound_only NÃO pode enviar outreach
    cc.status IN ('test', 'active') AS can_send_outreach,
    CASE cc.status
      WHEN 'draft' THEN 'Rascunho'
      WHEN 'test' THEN 'Teste'
      WHEN 'active' THEN 'Ativa'
      WHEN 'inbound_only' THEN 'Inbound Ativo'
      WHEN 'paused' THEN 'Pausada'
      WHEN 'completed' THEN 'Encerrada'
    END AS status_label
  FROM cluster_campaigns cc
  WHERE cc.id = p_campaign_id;
END;
$function$;

-- 4. Atualizar v_campaign_progress para incluir inbound_only no status_label
CREATE OR REPLACE VIEW v_campaign_progress AS
WITH campaign_stats AS (
  SELECT
    cc.id AS campaign_id,
    cc.campaign_name,
    cc.status,
    cc.created_at,
    cc.outreach_enabled,
    cc.outreach_completed_at,
    cc.ended_at,
    count(cl.id) AS total_leads,
    count(cl.id) FILTER (WHERE cl.status = ANY (ARRAY['contacted'::text, 'replied'::text, 'qualified'::text, 'converted'::text, 'failed'::text])) AS leads_contacted,
    count(cl.id) FILTER (WHERE cl.status = 'replied'::text) AS leads_replied,
    count(cl.id) FILTER (WHERE cl.status = 'qualified'::text) AS leads_qualified,
    count(cl.id) FILTER (WHERE cl.outreach_channel::text = 'whatsapp'::text) AS leads_whatsapp,
    count(cl.id) FILTER (WHERE cl.outreach_channel::text = 'instagram'::text) AS leads_instagram
  FROM cluster_campaigns cc
  LEFT JOIN campaign_leads cl ON cl.campaign_id = cc.id
  GROUP BY cc.id
),
daily_outreach_rate AS (
  SELECT
    daily.campaign_id,
    avg(daily.daily_count) AS avg_daily_rate
  FROM (
    SELECT
      campaign_leads.campaign_id,
      date(campaign_leads.updated_at) AS outreach_date,
      count(*) AS daily_count
    FROM campaign_leads
    WHERE (campaign_leads.status = ANY (ARRAY['contacted'::text, 'replied'::text, 'qualified'::text, 'converted'::text, 'failed'::text]))
      AND campaign_leads.updated_at >= (now() - '7 days'::interval)
    GROUP BY campaign_leads.campaign_id, (date(campaign_leads.updated_at))
  ) daily
  GROUP BY daily.campaign_id
),
conversations_active AS (
  SELECT
    aic_conversations.campaign_id,
    count(*) AS active_conversations,
    count(*) FILTER (WHERE aic_conversations.handoff_status IS NOT NULL AND aic_conversations.handoff_status::text <> 'completed'::text) AS pending_handoffs
  FROM aic_conversations
  WHERE aic_conversations.last_message_at >= (now() - '3 days'::interval)
  GROUP BY aic_conversations.campaign_id
)
SELECT
  cs.campaign_id,
  cs.campaign_name,
  cs.status,
  cs.created_at,
  cs.outreach_enabled,
  cs.outreach_completed_at,
  cs.ended_at,
  cs.total_leads,
  cs.leads_contacted,
  cs.leads_replied,
  cs.leads_qualified,
  cs.leads_whatsapp,
  cs.leads_instagram,
  cs.total_leads - cs.leads_contacted AS leads_remaining,
  CASE
    WHEN cs.total_leads > 0 THEN round(cs.leads_contacted::numeric / cs.total_leads::numeric * 100::numeric, 1)
    ELSE 0::numeric
  END AS progress_pct,
  COALESCE(round(dor.avg_daily_rate, 1), 0::numeric) AS avg_daily_rate,
  CASE
    WHEN COALESCE(dor.avg_daily_rate, 0::numeric) > 0::numeric THEN ceil((cs.total_leads - cs.leads_contacted)::numeric / dor.avg_daily_rate)
    ELSE NULL::numeric
  END AS estimated_days_remaining,
  CASE
    WHEN COALESCE(dor.avg_daily_rate, 0::numeric) > 0::numeric THEN CURRENT_DATE + ceil((cs.total_leads - cs.leads_contacted)::numeric / dor.avg_daily_rate)::integer
    ELSE NULL::date
  END AS estimated_completion_date,
  EXTRACT(day FROM now() - cs.created_at)::integer AS days_since_start,
  -- inbound_only nunca completa outreach automaticamente
  CASE
    WHEN cs.status = 'inbound_only' THEN FALSE
    ELSE cs.leads_contacted >= cs.total_leads
  END AS outreach_complete,
  COALESCE(ca.active_conversations, 0::bigint) AS active_conversations,
  COALESCE(ca.pending_handoffs, 0::bigint) AS pending_handoffs,
  -- inbound_only nunca fica ready_to_close automaticamente
  CASE
    WHEN cs.status = 'inbound_only' THEN FALSE
    WHEN cs.leads_contacted >= cs.total_leads AND COALESCE(ca.active_conversations, 0::bigint) = 0 AND COALESCE(ca.pending_handoffs, 0::bigint) = 0 THEN TRUE
    ELSE FALSE
  END AS ready_to_close,
  -- ATUALIZADO: incluir inbound_only no status_label
  CASE
    WHEN cs.status = 'completed'::campaign_status THEN 'Encerrada'::text
    WHEN cs.status = 'paused'::campaign_status THEN 'Pausada'::text
    WHEN cs.status = 'inbound_only'::campaign_status THEN 'Inbound Ativo'::text
    WHEN cs.leads_contacted >= cs.total_leads THEN 'Outreach Completo'::text
    WHEN cs.status = 'active'::campaign_status THEN 'Em Execução'::text
    WHEN cs.status = 'test'::campaign_status THEN 'Em Teste'::text
    ELSE 'Rascunho'::text
  END AS status_label
FROM campaign_stats cs
LEFT JOIN daily_outreach_rate dor ON dor.campaign_id = cs.campaign_id
LEFT JOIN conversations_active ca ON ca.campaign_id = cs.campaign_id;

-- 5. Garantir que funções de outreach continuam excluindo inbound_only
-- (Já estão protegidas por outreach_enabled = TRUE, mas vamos reforçar)

-- get_campaigns_with_active_outreach já checa:
-- WHERE cc.status = 'active' AND cc.outreach_enabled = TRUE
-- Como inbound_only != 'active', está OK

-- get_dms_pending_follow já checa:
-- WHERE cc.status = 'active' AND cc.outreach_enabled = TRUE
-- Como inbound_only != 'active', está OK

-- get_next_campaign_round_robin já checa:
-- WHERE c.status IN ('active', 'test') AND c.outreach_enabled = true
-- Como inbound_only não está na lista, está OK

-- 6. Comentário para documentação
COMMENT ON TYPE campaign_status IS
'Status possíveis de campanha:
- draft: Rascunho, campanha em configuração
- test: Teste, AI responde mas redireciona para contas de teste
- active: Ativa, AI responde + outreach habilitado
- inbound_only: Apenas inbound, AI responde mas SEM outreach/follow/unfollow
- paused: Pausada, AI não responde
- completed: Encerrada, campanha finalizada';
