-- =====================================================
-- MIGRATION: Campaign Closing System
-- Descrição: Sistema de encerramento de campanhas com
--            métricas finais e relatório consolidado
-- Data: 2026-02-06
-- =====================================================

-- =====================================================
-- 1. ADICIONAR STATUS 'completed' AO ENUM
-- =====================================================

ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'completed';

-- =====================================================
-- 2. ADICIONAR CAMPOS DE ENCERRAMENTO EM cluster_campaigns
-- =====================================================

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS end_reason VARCHAR(100);

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS final_metrics_snapshot JSONB;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS final_report_pdf_url TEXT;

ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS final_report_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN cluster_campaigns.ended_at IS 'Data/hora do encerramento da campanha';
COMMENT ON COLUMN cluster_campaigns.end_reason IS 'Motivo do encerramento (completed, cancelled, budget_exhausted, etc)';
COMMENT ON COLUMN cluster_campaigns.final_metrics_snapshot IS 'Snapshot JSON das métricas finais no momento do encerramento';
COMMENT ON COLUMN cluster_campaigns.final_report_pdf_url IS 'URL do PDF do relatório final';
COMMENT ON COLUMN cluster_campaigns.final_report_generated_at IS 'Data/hora da geração do relatório final';

-- =====================================================
-- 3. VIEW DE MÉTRICAS DE CAMPANHA EM TEMPO REAL
-- =====================================================

CREATE OR REPLACE VIEW v_campaign_metrics AS
SELECT
  cc.id AS campaign_id,
  cc.campaign_name,
  cc.status AS campaign_status,
  cc.created_at AS campaign_created_at,
  cc.ended_at AS campaign_ended_at,

  -- Duração da campanha
  CASE
    WHEN cc.ended_at IS NOT NULL THEN cc.ended_at - cc.created_at
    ELSE NOW() - cc.created_at
  END AS campaign_duration,

  -- Leads
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id) AS total_leads,
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.outreach_channel = 'whatsapp') AS leads_whatsapp,
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.outreach_channel = 'instagram') AS leads_instagram,

  -- Outreach
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'contacted') AS leads_contacted,
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'replied') AS leads_replied,
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'qualified') AS leads_qualified,
  (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'failed') AS leads_failed,

  -- Conversas
  (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) AS total_conversations,
  (SELECT COALESCE(SUM(ac.total_messages), 0) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) AS total_messages,
  (SELECT COALESCE(SUM(ac.lead_messages_count), 0) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) AS lead_messages,
  (SELECT COALESCE(SUM(ac.ai_messages_count), 0) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) AS ai_messages,
  (SELECT COALESCE(AVG(ac.total_messages), 0) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) AS avg_messages_per_conversation,

  -- Handoffs
  (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.handoff_status IS NOT NULL) AS total_handoffs,
  (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.handoff_status = 'completed') AS handoffs_completed,

  -- Conversões
  (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.conversion_status = 'converted') AS total_conversions,
  (SELECT COALESCE(SUM(ac.conversion_value), 0) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.conversion_status = 'converted') AS total_conversion_value,

  -- Interest Score
  (SELECT COALESCE(AVG(ac.interest_score), 0) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) AS avg_interest_score,

  -- Instagram Metrics
  ia.instagram_username,
  ia.followers_count AS current_followers,
  ia.followers_count_baseline AS baseline_followers,
  COALESCE(ia.followers_count, 0) - COALESCE(ia.followers_count_baseline, 0) AS followers_delta,
  CASE
    WHEN COALESCE(ia.followers_count_baseline, 0) > 0
    THEN ROUND(((ia.followers_count::NUMERIC - ia.followers_count_baseline) / ia.followers_count_baseline * 100), 2)
    ELSE 0
  END AS followers_growth_pct,

  -- Taxas calculadas
  CASE
    WHEN (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'contacted') > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'replied')::NUMERIC /
      (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id = cc.id AND cl.status = 'contacted') * 100, 2
    )
    ELSE 0
  END AS response_rate_pct,

  CASE
    WHEN (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.handoff_status IS NOT NULL)::NUMERIC /
      (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id) * 100, 2
    )
    ELSE 0
  END AS handoff_rate_pct,

  CASE
    WHEN (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.handoff_status IS NOT NULL) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.conversion_status = 'converted')::NUMERIC /
      (SELECT COUNT(*) FROM aic_conversations ac WHERE ac.campaign_id = cc.id AND ac.handoff_status IS NOT NULL) * 100, 2
    )
    ELSE 0
  END AS conversion_rate_pct

FROM cluster_campaigns cc
LEFT JOIN instagram_accounts ia ON ia.campaign_id = cc.id AND ia.status = 'active';

COMMENT ON VIEW v_campaign_metrics IS 'Métricas consolidadas de campanha em tempo real';

-- =====================================================
-- 4. FUNÇÃO PARA SNAPSHOT DE MÉTRICAS
-- =====================================================

CREATE OR REPLACE FUNCTION snapshot_campaign_metrics(p_campaign_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_metrics JSONB;
BEGIN
  SELECT jsonb_build_object(
    'snapshot_at', NOW(),
    'campaign_id', campaign_id,
    'campaign_name', campaign_name,
    'campaign_status', campaign_status,
    'campaign_duration_days', EXTRACT(DAY FROM campaign_duration),
    'leads', jsonb_build_object(
      'total', total_leads,
      'whatsapp', leads_whatsapp,
      'instagram', leads_instagram,
      'contacted', leads_contacted,
      'replied', leads_replied,
      'qualified', leads_qualified,
      'failed', leads_failed
    ),
    'conversations', jsonb_build_object(
      'total', total_conversations,
      'total_messages', total_messages,
      'lead_messages', lead_messages,
      'ai_messages', ai_messages,
      'avg_messages_per_conversation', ROUND(avg_messages_per_conversation::NUMERIC, 1)
    ),
    'handoffs', jsonb_build_object(
      'total', total_handoffs,
      'completed', handoffs_completed,
      'rate_pct', handoff_rate_pct
    ),
    'conversions', jsonb_build_object(
      'total', total_conversions,
      'value', total_conversion_value,
      'rate_pct', conversion_rate_pct
    ),
    'engagement', jsonb_build_object(
      'response_rate_pct', response_rate_pct,
      'avg_interest_score', ROUND(avg_interest_score::NUMERIC, 2)
    ),
    'instagram', jsonb_build_object(
      'username', instagram_username,
      'baseline_followers', baseline_followers,
      'final_followers', current_followers,
      'followers_delta', followers_delta,
      'followers_growth_pct', followers_growth_pct
    )
  ) INTO v_metrics
  FROM v_campaign_metrics
  WHERE campaign_id = p_campaign_id;

  RETURN COALESCE(v_metrics, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION snapshot_campaign_metrics IS 'Gera snapshot JSON das métricas atuais de uma campanha';

-- =====================================================
-- 5. FUNÇÃO PARA ENCERRAR CAMPANHA
-- =====================================================

CREATE OR REPLACE FUNCTION close_campaign(
  p_campaign_id UUID,
  p_end_reason VARCHAR DEFAULT 'completed'
)
RETURNS JSONB AS $$
DECLARE
  v_campaign cluster_campaigns%ROWTYPE;
  v_metrics JSONB;
BEGIN
  -- Verificar se campanha existe
  SELECT * INTO v_campaign FROM cluster_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada: %', p_campaign_id;
  END IF;

  -- Verificar se já está encerrada
  IF v_campaign.status = 'completed' THEN
    RAISE EXCEPTION 'Campanha já está encerrada';
  END IF;

  -- Gerar snapshot de métricas
  v_metrics := snapshot_campaign_metrics(p_campaign_id);

  -- Atualizar campanha
  UPDATE cluster_campaigns SET
    status = 'completed',
    ended_at = NOW(),
    end_reason = p_end_reason,
    final_metrics_snapshot = v_metrics,
    outreach_enabled = FALSE,
    updated_at = NOW()
  WHERE id = p_campaign_id;

  RETURN v_metrics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION close_campaign IS 'Encerra uma campanha e gera snapshot das métricas finais';

-- =====================================================
-- 6. VIEW DE HISTÓRICO DIÁRIO DE MÉTRICAS
-- =====================================================

CREATE OR REPLACE VIEW v_campaign_daily_metrics AS
WITH daily_contacts AS (
  SELECT
    campaign_id,
    DATE(updated_at) AS metric_date,
    COUNT(*) FILTER (WHERE status = 'contacted') AS contacted,
    COUNT(*) FILTER (WHERE status = 'replied') AS replied,
    COUNT(*) FILTER (WHERE status = 'qualified') AS qualified
  FROM campaign_leads
  WHERE updated_at IS NOT NULL
  GROUP BY campaign_id, DATE(updated_at)
),
daily_conversations AS (
  SELECT
    campaign_id,
    DATE(created_at) AS metric_date,
    COUNT(*) AS new_conversations,
    SUM(total_messages) AS messages,
    COUNT(*) FILTER (WHERE handoff_status IS NOT NULL) AS handoffs,
    COUNT(*) FILTER (WHERE conversion_status = 'converted') AS conversions
  FROM aic_conversations
  GROUP BY campaign_id, DATE(created_at)
),
daily_followers AS (
  SELECT
    iam.campaign_id,
    DATE(iam.recorded_at) AS metric_date,
    iam.followers_count,
    iam.followers_delta
  FROM instagram_account_metrics iam
  WHERE (iam.account_id, iam.recorded_at) IN (
    SELECT account_id, MAX(recorded_at)
    FROM instagram_account_metrics
    GROUP BY account_id, DATE(recorded_at)
  )
)
SELECT
  COALESCE(dc.campaign_id, dconv.campaign_id, df.campaign_id) AS campaign_id,
  COALESCE(dc.metric_date, dconv.metric_date, df.metric_date) AS metric_date,
  COALESCE(dc.contacted, 0) AS contacted,
  COALESCE(dc.replied, 0) AS replied,
  COALESCE(dc.qualified, 0) AS qualified,
  COALESCE(dconv.new_conversations, 0) AS new_conversations,
  COALESCE(dconv.messages, 0) AS messages,
  COALESCE(dconv.handoffs, 0) AS handoffs,
  COALESCE(dconv.conversions, 0) AS conversions,
  df.followers_count,
  df.followers_delta
FROM daily_contacts dc
FULL OUTER JOIN daily_conversations dconv
  ON dc.campaign_id = dconv.campaign_id AND dc.metric_date = dconv.metric_date
FULL OUTER JOIN daily_followers df
  ON COALESCE(dc.campaign_id, dconv.campaign_id) = df.campaign_id
  AND COALESCE(dc.metric_date, dconv.metric_date) = df.metric_date
ORDER BY metric_date;

COMMENT ON VIEW v_campaign_daily_metrics IS 'Métricas diárias de campanha para gráficos de evolução';

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
