-- =====================================================
-- MIGRATION 084: Instagram DM Sessions com Rate Limits
-- Data: 2025-12-13
-- Objetivo: Sessões Instagram para DM com conta oficial do cliente
--           Rate limiting centralizado: 10/hora, 80/dia
--           Similar a whapi_channels mas para Instagram via Puppeteer
-- =====================================================

-- =====================================================
-- TABELA: instagram_dm_sessions
-- Sessões Instagram do cliente para envio de DMs
-- =====================================================
CREATE TABLE IF NOT EXISTS instagram_dm_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificação da sessão/conta
  session_name VARCHAR(100) NOT NULL,           -- Nome amigável
  instagram_username VARCHAR(100) NOT NULL,     -- @usuario do Instagram
  instagram_password TEXT NOT NULL,             -- Senha criptografada

  -- Status da sessão
  status VARCHAR(30) DEFAULT 'disconnected' CHECK (status IN (
    'disconnected',     -- Sessão não iniciada
    'connecting',       -- Conectando
    'connected',        -- Conectado e funcional
    'expired',          -- Sessão expirada
    'banned',           -- Conta banida
    'rate_limited'      -- Atingiu limite, aguardando reset
  )),

  -- Dados de sessão Puppeteer
  cookies_data JSONB,                           -- Cookies de sessão
  user_agent TEXT,                              -- User agent usado
  last_ip VARCHAR(45),                          -- Último IP usado

  -- Rate Limiting (80/dia, 10/hora)
  hourly_limit INTEGER DEFAULT 10,              -- 10 DMs/hora
  daily_limit INTEGER DEFAULT 80,               -- 80 DMs/dia
  messages_sent_this_hour INTEGER DEFAULT 0,
  messages_sent_today INTEGER DEFAULT 0,
  current_hour_bucket INTEGER DEFAULT 0,        -- Para detectar mudança de hora

  -- Janela de operação
  allowed_hours_start INTEGER DEFAULT 9,        -- 9h
  allowed_hours_end INTEGER DEFAULT 18,         -- 18h
  allowed_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],  -- Seg-Sex

  -- Tracking
  total_messages_sent INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_connected_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_instagram_dm_sessions_status
  ON instagram_dm_sessions(status);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_sessions_username
  ON instagram_dm_sessions(instagram_username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_dm_sessions_unique_username
  ON instagram_dm_sessions(instagram_username) WHERE status != 'banned';

-- =====================================================
-- ADICIONAR FK em cluster_campaigns
-- =====================================================
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS instagram_session_uuid UUID REFERENCES instagram_dm_sessions(id);

-- Índice para busca por sessão
CREATE INDEX IF NOT EXISTS idx_cluster_campaigns_instagram_session_uuid
ON cluster_campaigns(instagram_session_uuid);

-- =====================================================
-- FUNÇÃO: can_instagram_session_send
-- Verifica se sessão pode enviar (rate limits + horários)
-- =====================================================
CREATE OR REPLACE FUNCTION can_instagram_session_send(p_session_id UUID)
RETURNS TABLE (
  can_send BOOLEAN,
  reason TEXT,
  hourly_remaining INTEGER,
  daily_remaining INTEGER
) AS $$
DECLARE
  v_session RECORD;
  v_current_hour INTEGER;
  v_current_day INTEGER;
BEGIN
  -- Buscar sessão
  SELECT * INTO v_session FROM instagram_dm_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Sessão não encontrada'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Verificar status
  IF v_session.status != 'connected' THEN
    RETURN QUERY SELECT
      false,
      ('Sessão não conectada: ' || v_session.status)::TEXT,
      0, 0;
    RETURN;
  END IF;

  -- Hora e dia atuais (timezone São Paulo)
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;
  v_current_day := EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

  -- Verificar janela de horário
  IF v_current_hour < v_session.allowed_hours_start OR v_current_hour >= v_session.allowed_hours_end THEN
    RETURN QUERY SELECT
      false,
      ('Fora do horário: ' || v_session.allowed_hours_start || 'h-' || v_session.allowed_hours_end || 'h')::TEXT,
      GREATEST(0, v_session.hourly_limit - v_session.messages_sent_this_hour),
      GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar dia permitido
  IF NOT (v_current_day = ANY(v_session.allowed_days)) THEN
    RETURN QUERY SELECT
      false,
      'Fora dos dias permitidos (Seg-Sex)'::TEXT,
      GREATEST(0, v_session.hourly_limit - v_session.messages_sent_this_hour),
      GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar limite horário
  IF v_session.messages_sent_this_hour >= v_session.hourly_limit THEN
    RETURN QUERY SELECT
      false,
      ('Limite horário: ' || v_session.hourly_limit || '/h')::TEXT,
      0,
      GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar limite diário
  IF v_session.messages_sent_today >= v_session.daily_limit THEN
    RETURN QUERY SELECT
      false,
      ('Limite diário: ' || v_session.daily_limit || '/dia')::TEXT,
      GREATEST(0, v_session.hourly_limit - v_session.messages_sent_this_hour),
      0;
    RETURN;
  END IF;

  -- Pode enviar!
  RETURN QUERY SELECT
    true,
    'OK'::TEXT,
    GREATEST(0, v_session.hourly_limit - v_session.messages_sent_this_hour),
    GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: increment_instagram_session_count
-- Incrementa contadores após envio bem-sucedido
-- =====================================================
CREATE OR REPLACE FUNCTION increment_instagram_session_count(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE instagram_dm_sessions
  SET
    messages_sent_this_hour = messages_sent_this_hour + 1,
    messages_sent_today = messages_sent_today + 1,
    total_messages_sent = total_messages_sent + 1,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: reset_instagram_session_counters
-- Reseta contadores (chamado por cron)
-- =====================================================
CREATE OR REPLACE FUNCTION reset_instagram_session_counters()
RETURNS TABLE (
  hourly_resets INTEGER,
  daily_resets INTEGER
) AS $$
DECLARE
  v_current_hour INTEGER;
  v_hourly INTEGER := 0;
  v_daily INTEGER := 0;
BEGIN
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

  -- Reset contador horário se mudou a hora
  UPDATE instagram_dm_sessions
  SET
    messages_sent_this_hour = 0,
    current_hour_bucket = v_current_hour,
    updated_at = NOW()
  WHERE current_hour_bucket != v_current_hour
    AND status = 'connected';

  GET DIAGNOSTICS v_hourly = ROW_COUNT;

  -- Reset contador diário à meia-noite
  IF v_current_hour = 0 THEN
    UPDATE instagram_dm_sessions
    SET
      messages_sent_today = 0,
      status = CASE WHEN status = 'rate_limited' THEN 'connected' ELSE status END,
      updated_at = NOW()
    WHERE messages_sent_today > 0;

    GET DIAGNOSTICS v_daily = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_hourly, v_daily;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: get_session_for_campaign
-- Retorna sessão associada a uma campanha
-- =====================================================
CREATE OR REPLACE FUNCTION get_session_for_campaign(p_campaign_id UUID)
RETURNS TABLE (
  session_id UUID,
  session_name VARCHAR,
  instagram_username VARCHAR,
  can_send BOOLEAN,
  reason TEXT,
  hourly_remaining INTEGER,
  daily_remaining INTEGER
) AS $$
DECLARE
  v_session_uuid UUID;
BEGIN
  -- Buscar sessão da campanha
  SELECT instagram_session_uuid INTO v_session_uuid
  FROM cluster_campaigns
  WHERE id = p_campaign_id;

  IF v_session_uuid IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID, NULL::VARCHAR, NULL::VARCHAR,
      false, 'Campanha sem sessão Instagram configurada'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Retornar info da sessão com verificação de rate limit
  RETURN QUERY
  SELECT
    ids.id,
    ids.session_name,
    ids.instagram_username,
    cs.can_send,
    cs.reason,
    cs.hourly_remaining,
    cs.daily_remaining
  FROM instagram_dm_sessions ids
  CROSS JOIN LATERAL can_instagram_session_send(ids.id) cs
  WHERE ids.id = v_session_uuid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: Campanhas com status da sessão Instagram
-- =====================================================
CREATE OR REPLACE VIEW v_campaigns_instagram_status AS
SELECT
  cc.id as campaign_id,
  cc.campaign_name,
  ids.id as session_uuid,
  ids.session_name,
  ids.instagram_username,
  ids.status as session_status,
  ids.messages_sent_today,
  ids.daily_limit,
  ids.messages_sent_this_hour,
  ids.hourly_limit,
  GREATEST(0, ids.daily_limit - ids.messages_sent_today) as daily_remaining,
  GREATEST(0, ids.hourly_limit - ids.messages_sent_this_hour) as hourly_remaining
FROM cluster_campaigns cc
LEFT JOIN instagram_dm_sessions ids ON ids.id = cc.instagram_session_uuid;

-- =====================================================
-- TRIGGER: Auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_instagram_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_instagram_session_updated ON instagram_dm_sessions;
CREATE TRIGGER trigger_instagram_session_updated
  BEFORE UPDATE ON instagram_dm_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_session_timestamp();

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE instagram_dm_sessions IS 'Sessões Instagram do cliente para DMs - rate limits: 10/h, 80/dia';
COMMENT ON COLUMN instagram_dm_sessions.hourly_limit IS 'Limite por hora (padrão 10) - DMs com conta oficial do cliente';
COMMENT ON COLUMN instagram_dm_sessions.daily_limit IS 'Limite por dia (padrão 80) - DMs durante horário comercial';
COMMENT ON COLUMN instagram_dm_sessions.instagram_password IS 'Senha criptografada - usar credentials-vault para decrypt';
COMMENT ON FUNCTION can_instagram_session_send IS 'Verifica rate limits e janela de horário antes de enviar DM';
COMMENT ON FUNCTION get_session_for_campaign IS 'Retorna sessão da campanha com status de rate limit';
