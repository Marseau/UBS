-- =====================================================
-- MIGRATION 082: WhatsApp Channels com Rate Limits Centralizados
-- Data: 2025-12-12
-- Objetivo: Rate limits por CANAL (número físico), não por campanha
--           Isso garante proteção anti-ban mesmo com múltiplas campanhas
-- =====================================================

-- =====================================================
-- TABELA: whapi_channels
-- Canais WhatsApp via Whapi.cloud com rate limiting centralizado
-- =====================================================
CREATE TABLE IF NOT EXISTS whapi_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificação do canal
  channel_id VARCHAR(100) NOT NULL UNIQUE,  -- ID do channel no Whapi
  channel_name VARCHAR(100),                 -- Nome amigável
  phone_number VARCHAR(20),                  -- Número do WhatsApp

  -- Credenciais
  api_token TEXT NOT NULL,                   -- Token de API do Whapi

  -- Status
  status VARCHAR(30) DEFAULT 'active' CHECK (status IN (
    'active',           -- Canal funcionando
    'paused',           -- Pausado manualmente
    'rate_limited',     -- Atingiu limite, aguardando reset
    'banned',           -- Conta banida
    'disconnected'      -- Desconectado do WhatsApp
  )),

  -- Rate Limiting (CENTRALIZADO - protege o número físico)
  hourly_limit INTEGER DEFAULT 15,           -- 15/hora = padrão seguro
  daily_limit INTEGER DEFAULT 120,           -- 120/dia = 15/h * 8h comerciais
  messages_sent_this_hour INTEGER DEFAULT 0,
  messages_sent_today INTEGER DEFAULT 0,
  current_hour_bucket INTEGER DEFAULT 0,     -- Para detectar mudança de hora

  -- Janela de operação
  allowed_hours_start INTEGER DEFAULT 8,     -- 8h
  allowed_hours_end INTEGER DEFAULT 18,      -- 18h
  allowed_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],  -- Seg-Sex

  -- Tracking
  total_messages_sent INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whapi_channels_status ON whapi_channels(status);
CREATE INDEX IF NOT EXISTS idx_whapi_channels_channel_id ON whapi_channels(channel_id);

-- =====================================================
-- ADICIONAR FK em cluster_campaigns
-- =====================================================
ALTER TABLE cluster_campaigns
ADD COLUMN IF NOT EXISTS whapi_channel_uuid UUID REFERENCES whapi_channels(id);

-- Índice para busca por canal
CREATE INDEX IF NOT EXISTS idx_cluster_campaigns_whapi_channel_uuid
ON cluster_campaigns(whapi_channel_uuid);

-- =====================================================
-- FUNÇÃO: can_whapi_channel_send
-- Verifica se canal pode enviar (rate limits + horários)
-- =====================================================
CREATE OR REPLACE FUNCTION can_whapi_channel_send(p_channel_id UUID)
RETURNS TABLE (
  can_send BOOLEAN,
  reason TEXT,
  hourly_remaining INTEGER,
  daily_remaining INTEGER
) AS $$
DECLARE
  v_channel RECORD;
  v_current_hour INTEGER;
  v_current_day INTEGER;
BEGIN
  -- Buscar canal
  SELECT * INTO v_channel FROM whapi_channels WHERE id = p_channel_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Canal não encontrado'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Verificar status
  IF v_channel.status != 'active' THEN
    RETURN QUERY SELECT
      false,
      ('Canal não ativo: ' || v_channel.status)::TEXT,
      0, 0;
    RETURN;
  END IF;

  -- Hora e dia atuais (timezone São Paulo)
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;
  v_current_day := EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

  -- Verificar janela de horário
  IF v_current_hour < v_channel.allowed_hours_start OR v_current_hour >= v_channel.allowed_hours_end THEN
    RETURN QUERY SELECT
      false,
      ('Fora do horário: ' || v_channel.allowed_hours_start || 'h-' || v_channel.allowed_hours_end || 'h')::TEXT,
      GREATEST(0, v_channel.hourly_limit - v_channel.messages_sent_this_hour),
      GREATEST(0, v_channel.daily_limit - v_channel.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar dia permitido
  IF NOT (v_current_day = ANY(v_channel.allowed_days)) THEN
    RETURN QUERY SELECT
      false,
      'Fora dos dias permitidos'::TEXT,
      GREATEST(0, v_channel.hourly_limit - v_channel.messages_sent_this_hour),
      GREATEST(0, v_channel.daily_limit - v_channel.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar limite horário
  IF v_channel.messages_sent_this_hour >= v_channel.hourly_limit THEN
    RETURN QUERY SELECT
      false,
      ('Limite horário: ' || v_channel.hourly_limit || '/h')::TEXT,
      0,
      GREATEST(0, v_channel.daily_limit - v_channel.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar limite diário
  IF v_channel.messages_sent_today >= v_channel.daily_limit THEN
    RETURN QUERY SELECT
      false,
      ('Limite diário: ' || v_channel.daily_limit || '/dia')::TEXT,
      GREATEST(0, v_channel.hourly_limit - v_channel.messages_sent_this_hour),
      0;
    RETURN;
  END IF;

  -- Pode enviar!
  RETURN QUERY SELECT
    true,
    'OK'::TEXT,
    GREATEST(0, v_channel.hourly_limit - v_channel.messages_sent_this_hour),
    GREATEST(0, v_channel.daily_limit - v_channel.messages_sent_today);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: increment_whapi_channel_count
-- Incrementa contadores após envio bem-sucedido
-- =====================================================
CREATE OR REPLACE FUNCTION increment_whapi_channel_count(p_channel_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whapi_channels
  SET
    messages_sent_this_hour = messages_sent_this_hour + 1,
    messages_sent_today = messages_sent_today + 1,
    total_messages_sent = total_messages_sent + 1,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = p_channel_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: reset_whapi_channel_counters
-- Reseta contadores (chamado por cron)
-- =====================================================
CREATE OR REPLACE FUNCTION reset_whapi_channel_counters()
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
  UPDATE whapi_channels
  SET
    messages_sent_this_hour = 0,
    current_hour_bucket = v_current_hour,
    updated_at = NOW()
  WHERE current_hour_bucket != v_current_hour
    AND status = 'active';

  GET DIAGNOSTICS v_hourly = ROW_COUNT;

  -- Reset contador diário à meia-noite
  IF v_current_hour = 0 THEN
    UPDATE whapi_channels
    SET
      messages_sent_today = 0,
      status = CASE WHEN status = 'rate_limited' THEN 'active' ELSE status END,
      updated_at = NOW()
    WHERE messages_sent_today > 0;

    GET DIAGNOSTICS v_daily = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_hourly, v_daily;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: get_channel_for_campaign
-- Retorna canal associado a uma campanha
-- =====================================================
CREATE OR REPLACE FUNCTION get_channel_for_campaign(p_campaign_id UUID)
RETURNS TABLE (
  channel_id UUID,
  channel_name VARCHAR,
  phone_number VARCHAR,
  can_send BOOLEAN,
  reason TEXT,
  hourly_remaining INTEGER,
  daily_remaining INTEGER
) AS $$
DECLARE
  v_channel_uuid UUID;
BEGIN
  -- Buscar canal da campanha
  SELECT whapi_channel_uuid INTO v_channel_uuid
  FROM cluster_campaigns
  WHERE id = p_campaign_id;

  IF v_channel_uuid IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID, NULL::VARCHAR, NULL::VARCHAR,
      false, 'Campanha sem canal configurado'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Retornar info do canal com verificação de rate limit
  RETURN QUERY
  SELECT
    wc.id,
    wc.channel_name,
    wc.phone_number,
    cs.can_send,
    cs.reason,
    cs.hourly_remaining,
    cs.daily_remaining
  FROM whapi_channels wc
  CROSS JOIN LATERAL can_whapi_channel_send(wc.id) cs
  WHERE wc.id = v_channel_uuid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEW: Campanhas com status do canal
-- =====================================================
CREATE OR REPLACE VIEW v_campaigns_channel_status AS
SELECT
  cc.id as campaign_id,
  cc.campaign_name,
  wc.id as channel_uuid,
  wc.channel_name,
  wc.phone_number,
  wc.status as channel_status,
  wc.messages_sent_today,
  wc.daily_limit,
  wc.messages_sent_this_hour,
  wc.hourly_limit,
  GREATEST(0, wc.daily_limit - wc.messages_sent_today) as daily_remaining,
  GREATEST(0, wc.hourly_limit - wc.messages_sent_this_hour) as hourly_remaining
FROM cluster_campaigns cc
LEFT JOIN whapi_channels wc ON wc.id = cc.whapi_channel_uuid;

-- =====================================================
-- TRIGGER: Auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_whapi_channel_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_whapi_channel_updated ON whapi_channels;
CREATE TRIGGER trigger_whapi_channel_updated
  BEFORE UPDATE ON whapi_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_whapi_channel_timestamp();

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE whapi_channels IS 'Canais WhatsApp via Whapi.cloud - rate limits centralizados por número físico';
COMMENT ON COLUMN whapi_channels.hourly_limit IS 'Limite por hora (padrão 15) - compartilhado entre todas as campanhas do canal';
COMMENT ON COLUMN whapi_channels.daily_limit IS 'Limite por dia (padrão 120) - compartilhado entre todas as campanhas do canal';
COMMENT ON FUNCTION can_whapi_channel_send IS 'Verifica rate limits e janela de horário antes de enviar';
COMMENT ON FUNCTION get_channel_for_campaign IS 'Retorna canal da campanha com status de rate limit';
