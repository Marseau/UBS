-- =====================================================
-- Migration 095: Sistema de Follow/Unfollow por Campanha
--
-- Tabela para rastrear follows feitos apos envio de DM
-- e automatizar unfollows apos 72h sem engajamento
-- =====================================================

-- Tabela principal
CREATE TABLE IF NOT EXISTS campaign_instagram_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES instagram_leads(id) ON DELETE CASCADE,
  instagram_username VARCHAR(255) NOT NULL,

  -- Timestamps de acao
  followed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_engagement_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  unfollowed_at TIMESTAMPTZ,

  -- Status e resultado
  -- Valores: 'followed', 'engaged', 'unfollowed', 'kept', 'error'
  status VARCHAR(50) NOT NULL DEFAULT 'followed',

  -- Engajamento detectado
  followed_back BOOLEAN DEFAULT FALSE,
  liked_post BOOLEAN DEFAULT FALSE,
  commented BOOLEAN DEFAULT FALSE,
  dm_replied BOOLEAN DEFAULT FALSE,
  engagement_checked_at TIMESTAMPTZ,

  -- Metadados
  dm_message_id UUID REFERENCES aic_message_queue(id) ON DELETE SET NULL,
  unfollow_reason VARCHAR(100),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: um lead so pode ser seguido uma vez por campanha
  UNIQUE(campaign_id, lead_id)
);

-- Indices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_cif_campaign_status
  ON campaign_instagram_follows(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_cif_check_engagement
  ON campaign_instagram_follows(check_engagement_at)
  WHERE status = 'followed';

CREATE INDEX IF NOT EXISTS idx_cif_pending_unfollow
  ON campaign_instagram_follows(campaign_id, status, check_engagement_at)
  WHERE status = 'followed';

CREATE INDEX IF NOT EXISTS idx_cif_instagram_username
  ON campaign_instagram_follows(instagram_username);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_campaign_instagram_follows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_campaign_instagram_follows_updated_at
  ON campaign_instagram_follows;

CREATE TRIGGER trigger_update_campaign_instagram_follows_updated_at
  BEFORE UPDATE ON campaign_instagram_follows
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_instagram_follows_updated_at();

-- =====================================================
-- FUNCAO: Registrar follow apos DM
-- =====================================================
CREATE OR REPLACE FUNCTION register_instagram_follow(
  p_campaign_id UUID,
  p_lead_id UUID,
  p_instagram_username VARCHAR,
  p_dm_message_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_follow_id UUID;
BEGIN
  INSERT INTO campaign_instagram_follows (
    campaign_id, lead_id, instagram_username, dm_message_id
  ) VALUES (
    p_campaign_id, p_lead_id, p_instagram_username, p_dm_message_id
  )
  ON CONFLICT (campaign_id, lead_id) DO UPDATE SET
    followed_at = NOW(),
    check_engagement_at = NOW() + INTERVAL '72 hours',
    status = 'followed',
    unfollowed_at = NULL,
    dm_message_id = COALESCE(EXCLUDED.dm_message_id, campaign_instagram_follows.dm_message_id),
    updated_at = NOW()
  RETURNING id INTO v_follow_id;

  -- Atualizar instagram_leads
  UPDATE instagram_leads SET
    follow_status = 'followed',
    followed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN v_follow_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: Buscar candidatos para unfollow (por campanha)
-- IMPORTANTE: Só processa campanhas com status = 'active'
-- =====================================================
CREATE OR REPLACE FUNCTION get_unfollow_candidates(
  p_campaign_id UUID,
  p_limit INT DEFAULT 5
) RETURNS TABLE (
  follow_id UUID,
  lead_id UUID,
  instagram_username VARCHAR,
  followed_at TIMESTAMPTZ,
  hours_since_follow NUMERIC,
  campaign_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cif.id,
    cif.lead_id,
    cif.instagram_username,
    cif.followed_at,
    EXTRACT(EPOCH FROM (NOW() - cif.followed_at)) / 3600 as hours_since_follow,
    cc.status::TEXT as campaign_status
  FROM campaign_instagram_follows cif
  JOIN cluster_campaigns cc ON cc.id = cif.campaign_id
  WHERE cif.campaign_id = p_campaign_id
    AND cif.status = 'followed'
    AND cif.check_engagement_at <= NOW()
    AND cif.followed_back = FALSE
    AND cif.dm_replied = FALSE
    AND cc.status = 'active'  -- APENAS campanhas ATIVAS
  ORDER BY cif.followed_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: Registrar unfollow
-- =====================================================
CREATE OR REPLACE FUNCTION register_instagram_unfollow(
  p_follow_id UUID,
  p_reason VARCHAR DEFAULT 'no_engagement'
) RETURNS BOOLEAN AS $$
DECLARE
  v_lead_id UUID;
BEGIN
  UPDATE campaign_instagram_follows SET
    status = 'unfollowed',
    unfollowed_at = NOW(),
    unfollow_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_follow_id
  RETURNING lead_id INTO v_lead_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Atualizar instagram_leads
  UPDATE instagram_leads SET
    follow_status = 'unfollowed',
    unfollowed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_lead_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: Marcar engajamento detectado
-- =====================================================
CREATE OR REPLACE FUNCTION mark_follow_engagement(
  p_lead_id UUID,
  p_engagement_type VARCHAR -- 'followed_back', 'dm_replied', 'liked', 'commented'
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE campaign_instagram_follows SET
    status = 'engaged',
    engagement_checked_at = NOW(),
    followed_back = CASE WHEN p_engagement_type = 'followed_back' THEN TRUE ELSE followed_back END,
    dm_replied = CASE WHEN p_engagement_type = 'dm_replied' THEN TRUE ELSE dm_replied END,
    liked_post = CASE WHEN p_engagement_type = 'liked' THEN TRUE ELSE liked_post END,
    commented = CASE WHEN p_engagement_type = 'commented' THEN TRUE ELSE commented END,
    updated_at = NOW()
  WHERE lead_id = p_lead_id
    AND status = 'followed';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: Buscar DMs enviados sem follow registrado
-- (para o workflow "Follow After DM")
-- IMPORTANTE: Só processa campanhas com status = 'active'
-- =====================================================
CREATE OR REPLACE FUNCTION get_dms_pending_follow(
  p_limit INT DEFAULT 3,
  p_since_minutes INT DEFAULT 30
) RETURNS TABLE (
  message_id UUID,
  campaign_id UUID,
  campaign_status TEXT,
  lead_id UUID,
  instagram_username VARCHAR,
  sent_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mq.id as message_id,
    mq.campaign_id,
    cc.status::TEXT as campaign_status,
    il.id as lead_id,
    mq.instagram_username,
    mq.sent_at
  FROM aic_message_queue mq
  JOIN cluster_campaigns cc ON cc.id = mq.campaign_id
  JOIN instagram_leads il ON il.username = mq.instagram_username
  LEFT JOIN campaign_instagram_follows cif
    ON cif.campaign_id = mq.campaign_id AND cif.lead_id = il.id
  WHERE mq.channel = 'instagram'
    AND mq.status = 'sent'
    AND mq.sent_at >= NOW() - (p_since_minutes * INTERVAL '1 minute')
    AND cif.id IS NULL
    AND cc.status = 'active'  -- APENAS campanhas ATIVAS
    AND cc.outreach_enabled = TRUE
  ORDER BY mq.sent_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: Listar campanhas com outreach ativo
-- (para o workflow "Nightly Unfollow")
-- IMPORTANTE: Só retorna campanhas com status = 'active'
-- =====================================================
CREATE OR REPLACE FUNCTION get_campaigns_with_active_outreach()
RETURNS TABLE (
  campaign_id UUID,
  campaign_name VARCHAR,
  campaign_status TEXT,
  pending_unfollows BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.campaign_name,
    cc.status::TEXT as campaign_status,
    COUNT(cif.id)::BIGINT as pending_unfollows
  FROM cluster_campaigns cc
  JOIN campaign_instagram_follows cif ON cif.campaign_id = cc.id
  WHERE cc.status = 'active'  -- APENAS campanhas ATIVAS
    AND cc.outreach_enabled = TRUE
    AND cif.status = 'followed'
    AND cif.check_engagement_at <= NOW()
    AND cif.followed_back = FALSE
    AND cif.dm_replied = FALSE
  GROUP BY cc.id, cc.campaign_name, cc.status
  HAVING COUNT(cif.id) > 0
  ORDER BY pending_unfollows DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: Status de follows por campanha
-- Inclui campaign_status para identificar campanhas ativas
-- =====================================================
CREATE OR REPLACE VIEW campaign_follow_stats AS
SELECT
  cc.id as campaign_id,
  cc.campaign_name,
  cc.status::TEXT as campaign_status,
  COUNT(*) FILTER (WHERE cif.status = 'followed') as pending_check,
  COUNT(*) FILTER (WHERE cif.status = 'engaged') as engaged,
  COUNT(*) FILTER (WHERE cif.status = 'unfollowed') as unfollowed,
  COUNT(*) FILTER (WHERE cif.status = 'kept') as kept,
  COUNT(*) as total_follows,
  ROUND(
    COUNT(*) FILTER (WHERE cif.status = 'engaged')::NUMERIC /
    NULLIF(COUNT(*)::NUMERIC, 0) * 100,
    2
  ) as engagement_rate
FROM cluster_campaigns cc
LEFT JOIN campaign_instagram_follows cif ON cif.campaign_id = cc.id
WHERE cc.outreach_enabled = TRUE
GROUP BY cc.id, cc.campaign_name, cc.status
ORDER BY cc.campaign_name;

-- Comentario final
COMMENT ON TABLE campaign_instagram_follows IS
  'Rastreia follows feitos apos envio de DM Instagram para automatizar unfollows sem engajamento';
