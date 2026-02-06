-- =====================================================
-- MIGRATION: Instagram Account Metrics Tracking
-- Descrição: Sistema de tracking de followers/follows para
--            contas Instagram de campanhas AIC
-- Data: 2026-02-06
-- =====================================================

-- =====================================================
-- 1. ADICIONAR COLUNAS EM instagram_accounts
-- =====================================================

-- Followers count atual (snapshot)
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS followers_count INTEGER;

-- Follows count atual (following)
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS follows_count INTEGER;

-- Media count atual
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS media_count INTEGER;

-- Timestamp da última atualização de métricas
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;

-- Followers no início da campanha (baseline)
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS followers_count_baseline INTEGER;

-- Data do baseline
ALTER TABLE instagram_accounts
ADD COLUMN IF NOT EXISTS baseline_recorded_at TIMESTAMPTZ;

COMMENT ON COLUMN instagram_accounts.followers_count IS 'Número atual de seguidores (atualizado periodicamente via Meta API)';
COMMENT ON COLUMN instagram_accounts.follows_count IS 'Número atual de contas seguidas (following)';
COMMENT ON COLUMN instagram_accounts.media_count IS 'Número atual de posts publicados';
COMMENT ON COLUMN instagram_accounts.metrics_updated_at IS 'Timestamp da última atualização das métricas';
COMMENT ON COLUMN instagram_accounts.followers_count_baseline IS 'Número de seguidores no início da campanha (para calcular delta)';
COMMENT ON COLUMN instagram_accounts.baseline_recorded_at IS 'Data em que o baseline foi registrado';

-- =====================================================
-- 2. TABELA DE HISTÓRICO DE MÉTRICAS
-- =====================================================

CREATE TABLE IF NOT EXISTS instagram_account_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relacionamento com conta Instagram
  account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,

  -- Relacionamento com campanha (denormalizado para queries rápidas)
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- Métricas snapshot
  followers_count INTEGER NOT NULL,
  follows_count INTEGER,
  media_count INTEGER,

  -- Delta desde registro anterior
  followers_delta INTEGER,  -- Positivo = ganhou, Negativo = perdeu
  follows_delta INTEGER,

  -- Contexto da campanha no momento
  campaign_status VARCHAR(30),
  outreach_enabled BOOLEAN,

  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Metadados
  source VARCHAR(30) DEFAULT 'api_refresh' CHECK (source IN (
    'oauth_callback',    -- Registro durante OAuth
    'api_refresh',       -- Atualização periódica via API
    'manual',            -- Inserção manual
    'baseline'           -- Registro de baseline inicial
  ))
);

-- Indices
CREATE INDEX idx_iam_account_id ON instagram_account_metrics(account_id);
CREATE INDEX idx_iam_campaign_id ON instagram_account_metrics(campaign_id);
CREATE INDEX idx_iam_recorded_at ON instagram_account_metrics(recorded_at DESC);
CREATE INDEX idx_iam_account_recorded ON instagram_account_metrics(account_id, recorded_at DESC);

COMMENT ON TABLE instagram_account_metrics IS 'Histórico de métricas de contas Instagram para tracking de ROI de campanhas';

-- =====================================================
-- 3. FUNÇÃO PARA REGISTRAR MÉTRICA
-- =====================================================

CREATE OR REPLACE FUNCTION record_instagram_metrics(
  p_account_id UUID,
  p_followers_count INTEGER,
  p_follows_count INTEGER DEFAULT NULL,
  p_media_count INTEGER DEFAULT NULL,
  p_source VARCHAR DEFAULT 'api_refresh'
)
RETURNS instagram_account_metrics AS $$
DECLARE
  v_account instagram_accounts%ROWTYPE;
  v_last_metric instagram_account_metrics%ROWTYPE;
  v_new_metric instagram_account_metrics%ROWTYPE;
  v_followers_delta INTEGER;
  v_follows_delta INTEGER;
BEGIN
  -- Buscar conta
  SELECT * INTO v_account FROM instagram_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta Instagram não encontrada: %', p_account_id;
  END IF;

  -- Buscar última métrica para calcular delta
  SELECT * INTO v_last_metric
  FROM instagram_account_metrics
  WHERE account_id = p_account_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  -- Calcular deltas
  IF FOUND THEN
    v_followers_delta := p_followers_count - v_last_metric.followers_count;
    v_follows_delta := COALESCE(p_follows_count, 0) - COALESCE(v_last_metric.follows_count, 0);
  ELSE
    v_followers_delta := 0;
    v_follows_delta := 0;
  END IF;

  -- Inserir nova métrica
  INSERT INTO instagram_account_metrics (
    account_id,
    campaign_id,
    followers_count,
    follows_count,
    media_count,
    followers_delta,
    follows_delta,
    campaign_status,
    outreach_enabled,
    source
  )
  SELECT
    p_account_id,
    v_account.campaign_id,
    p_followers_count,
    p_follows_count,
    p_media_count,
    v_followers_delta,
    v_follows_delta,
    cc.status,
    cc.outreach_enabled,
    p_source
  FROM cluster_campaigns cc
  WHERE cc.id = v_account.campaign_id
  RETURNING * INTO v_new_metric;

  -- Atualizar conta com valores atuais
  UPDATE instagram_accounts SET
    followers_count = p_followers_count,
    follows_count = COALESCE(p_follows_count, follows_count),
    media_count = COALESCE(p_media_count, media_count),
    metrics_updated_at = NOW(),
    -- Se não tem baseline, registrar agora
    followers_count_baseline = COALESCE(followers_count_baseline, p_followers_count),
    baseline_recorded_at = COALESCE(baseline_recorded_at, NOW())
  WHERE id = p_account_id;

  RETURN v_new_metric;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_instagram_metrics IS 'Registra métricas de conta Instagram e calcula delta desde última medição';

-- =====================================================
-- 4. VIEW DE MÉTRICAS POR CAMPANHA
-- =====================================================

CREATE OR REPLACE VIEW v_campaign_instagram_metrics AS
SELECT
  cc.id AS campaign_id,
  cc.campaign_name,
  cc.status AS campaign_status,
  ia.id AS account_id,
  ia.instagram_username,
  ia.followers_count AS current_followers,
  ia.follows_count AS current_follows,
  ia.followers_count_baseline AS baseline_followers,
  ia.baseline_recorded_at,
  ia.metrics_updated_at,
  -- Delta desde baseline
  COALESCE(ia.followers_count, 0) - COALESCE(ia.followers_count_baseline, 0) AS followers_delta_total,
  -- Percentual de crescimento
  CASE
    WHEN COALESCE(ia.followers_count_baseline, 0) > 0
    THEN ROUND(((ia.followers_count::NUMERIC - ia.followers_count_baseline) / ia.followers_count_baseline * 100), 2)
    ELSE 0
  END AS followers_growth_pct,
  -- Última métrica registrada
  (
    SELECT recorded_at
    FROM instagram_account_metrics
    WHERE account_id = ia.id
    ORDER BY recorded_at DESC
    LIMIT 1
  ) AS last_metric_recorded_at,
  -- Total de registros de métricas
  (
    SELECT COUNT(*)
    FROM instagram_account_metrics
    WHERE account_id = ia.id
  ) AS total_metric_records
FROM cluster_campaigns cc
LEFT JOIN instagram_accounts ia ON ia.campaign_id = cc.id
WHERE ia.id IS NOT NULL;

COMMENT ON VIEW v_campaign_instagram_metrics IS 'Visão consolidada de métricas Instagram por campanha com cálculo de ROI';

-- =====================================================
-- 5. FUNÇÃO PARA OBTER HISTÓRICO DE MÉTRICAS
-- =====================================================

CREATE OR REPLACE FUNCTION get_instagram_metrics_history(
  p_campaign_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  recorded_date DATE,
  followers_count INTEGER,
  follows_count INTEGER,
  followers_delta INTEGER,
  follows_delta INTEGER,
  cumulative_followers_delta INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_metrics AS (
    SELECT
      DATE(iam.recorded_at) AS metric_date,
      iam.followers_count,
      iam.follows_count,
      iam.followers_delta,
      iam.follows_delta,
      ROW_NUMBER() OVER (PARTITION BY DATE(iam.recorded_at) ORDER BY iam.recorded_at DESC) AS rn
    FROM instagram_account_metrics iam
    JOIN instagram_accounts ia ON ia.id = iam.account_id
    WHERE ia.campaign_id = p_campaign_id
      AND iam.recorded_at >= NOW() - (p_days || ' days')::INTERVAL
  )
  SELECT
    dm.metric_date,
    dm.followers_count,
    dm.follows_count,
    dm.followers_delta,
    dm.follows_delta,
    SUM(dm.followers_delta) OVER (ORDER BY dm.metric_date) AS cumulative_followers_delta
  FROM daily_metrics dm
  WHERE dm.rn = 1  -- Apenas último registro de cada dia
  ORDER BY dm.metric_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_instagram_metrics_history IS 'Retorna histórico diário de métricas Instagram para uma campanha';

-- =====================================================
-- 6. RLS (Row Level Security)
-- =====================================================

ALTER TABLE instagram_account_metrics ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total
CREATE POLICY instagram_account_metrics_service_role ON instagram_account_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
