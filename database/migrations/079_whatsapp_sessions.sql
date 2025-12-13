-- =====================================================
-- MIGRATION: WhatsApp Sessions Management
-- Descricao: Tabelas e funcoes para gerenciamento de sessoes
--            WhatsApp Web via Puppeteer (1 sessao por campanha)
-- Data: 2025-12-12
-- =====================================================

-- =====================================================
-- TABELA: whatsapp_sessions
-- Armazena sessoes WhatsApp Web vinculadas a campanhas
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relacionamento com campanha (1:1) - cluster_campaigns
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- Identificacao da sessao
  session_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),

  -- Status da sessao
  status VARCHAR(30) NOT NULL DEFAULT 'disconnected' CHECK (status IN (
    'disconnected',     -- Sessao nao iniciada
    'qr_pending',       -- Aguardando scan do QR Code
    'connecting',       -- Conectando apos scan
    'connected',        -- Conectado e funcional
    'expired',          -- QR Code expirou
    'banned',           -- Conta banida pelo WhatsApp
    'session_invalid'   -- Sessao invalidada
  )),

  -- QR Code (temporario, base64)
  qr_code_data TEXT,
  qr_code_generated_at TIMESTAMP WITH TIME ZONE,
  qr_code_expires_at TIMESTAMP WITH TIME ZONE,

  -- Rate Limiting (protecao anti-ban)
  messages_sent_today INTEGER DEFAULT 0,
  messages_sent_this_hour INTEGER DEFAULT 0,
  hourly_limit INTEGER DEFAULT 15,    -- 15/hora = padrao seguro
  daily_limit INTEGER DEFAULT 120,    -- 120/dia = 15/h * 8h comerciais

  -- Janela de operacao (horarios permitidos)
  allowed_hours_start INTEGER DEFAULT 8,   -- 8h
  allowed_hours_end INTEGER DEFAULT 18,    -- 18h
  allowed_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],  -- Seg-Sex

  -- Controle de hora atual (para reset de contador horario)
  current_hour_bucket INTEGER DEFAULT 0,

  -- Tracking
  last_activity_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  total_messages_sent INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,

  -- Gerenciamento
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_campaign ON whatsapp_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active ON whatsapp_sessions(is_active) WHERE is_active = true;

-- Constraint: apenas 1 sessao ativa por campanha
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_sessions_unique_campaign
  ON whatsapp_sessions(campaign_id) WHERE is_active = true;

-- =====================================================
-- TABELA: whatsapp_message_log
-- Log de todas as mensagens enviadas/recebidas
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relacionamentos
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- Direcao
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Destinatario/Remetente
  to_phone VARCHAR(20),
  from_phone VARCHAR(20),

  -- Conteudo
  message_text TEXT,
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN (
    'text', 'image', 'audio', 'video', 'document', 'location', 'contact'
  )),

  -- Status de entrega
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Aguardando envio
    'sent',         -- Enviado (1 check)
    'delivered',    -- Entregue (2 checks)
    'read',         -- Lido (2 checks azuis)
    'failed',       -- Falhou
    'received'      -- Recebido (inbound)
  )),

  -- Metadata
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,

  -- Vinculo com lead (se houver)
  lead_id UUID REFERENCES instagram_leads(id),
  outreach_queue_id UUID REFERENCES campaign_outreach_queue(id),

  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_wa_message_log_session ON whatsapp_message_log(session_id);
CREATE INDEX IF NOT EXISTS idx_wa_message_log_campaign ON whatsapp_message_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_message_log_direction ON whatsapp_message_log(direction);
CREATE INDEX IF NOT EXISTS idx_wa_message_log_status ON whatsapp_message_log(status);
CREATE INDEX IF NOT EXISTS idx_wa_message_log_phone ON whatsapp_message_log(to_phone);
CREATE INDEX IF NOT EXISTS idx_wa_message_log_created ON whatsapp_message_log(created_at DESC);

-- =====================================================
-- FUNCAO: update_whatsapp_session_status
-- Atualiza status da sessao com historico
-- =====================================================
CREATE OR REPLACE FUNCTION update_whatsapp_session_status(
  p_session_id UUID,
  p_status VARCHAR,
  p_phone_number VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_sessions
  SET
    status = p_status,
    phone_number = COALESCE(p_phone_number, phone_number),
    last_error = CASE WHEN p_error_message IS NOT NULL THEN p_error_message ELSE last_error END,
    last_error_at = CASE WHEN p_error_message IS NOT NULL THEN NOW() ELSE last_error_at END,
    last_activity_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: can_whatsapp_session_send
-- Verifica se sessao pode enviar mensagem (rate limits + horarios)
-- =====================================================
CREATE OR REPLACE FUNCTION can_whatsapp_session_send(p_session_id UUID)
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
  v_is_within_hours BOOLEAN;
  v_is_allowed_day BOOLEAN;
BEGIN
  -- Buscar sessao
  SELECT * INTO v_session FROM whatsapp_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Sessao nao encontrada'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Verificar se sessao esta conectada
  IF v_session.status != 'connected' THEN
    RETURN QUERY SELECT
      false,
      ('Sessao nao conectada (status: ' || v_session.status || ')')::TEXT,
      0, 0;
    RETURN;
  END IF;

  -- Verificar se sessao esta ativa
  IF NOT v_session.is_active THEN
    RETURN QUERY SELECT false, 'Sessao desativada'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Hora e dia atuais (timezone Sao Paulo)
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;
  v_current_day := EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

  -- Verificar janela de horario
  v_is_within_hours := v_current_hour >= v_session.allowed_hours_start
                   AND v_current_hour < v_session.allowed_hours_end;
  v_is_allowed_day := v_current_day = ANY(v_session.allowed_days);

  IF NOT v_is_within_hours THEN
    RETURN QUERY SELECT
      false,
      ('Fora do horario comercial (' || v_session.allowed_hours_start || 'h-' || v_session.allowed_hours_end || 'h)')::TEXT,
      GREATEST(0, v_session.hourly_limit - v_session.messages_sent_this_hour),
      GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
    RETURN;
  END IF;

  IF NOT v_is_allowed_day THEN
    RETURN QUERY SELECT
      false,
      'Fora dos dias permitidos (Seg-Sex)'::TEXT,
      GREATEST(0, v_session.hourly_limit - v_session.messages_sent_this_hour),
      GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar limite por hora
  IF v_session.messages_sent_this_hour >= v_session.hourly_limit THEN
    RETURN QUERY SELECT
      false,
      ('Limite horario atingido (' || v_session.hourly_limit || '/hora)')::TEXT,
      0,
      GREATEST(0, v_session.daily_limit - v_session.messages_sent_today);
    RETURN;
  END IF;

  -- Verificar limite diario
  IF v_session.messages_sent_today >= v_session.daily_limit THEN
    RETURN QUERY SELECT
      false,
      ('Limite diario atingido (' || v_session.daily_limit || '/dia)')::TEXT,
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
-- FUNCAO: increment_whatsapp_message_count
-- Incrementa contadores de mensagem
-- =====================================================
CREATE OR REPLACE FUNCTION increment_whatsapp_message_count(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_sessions
  SET
    messages_sent_this_hour = messages_sent_this_hour + 1,
    messages_sent_today = messages_sent_today + 1,
    total_messages_sent = total_messages_sent + 1,
    last_activity_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: reset_whatsapp_rate_counters
-- Reseta contadores (chamado pelo cron/heartbeat)
-- =====================================================
CREATE OR REPLACE FUNCTION reset_whatsapp_rate_counters()
RETURNS TABLE (
  hourly_resets INTEGER,
  daily_resets INTEGER
) AS $$
DECLARE
  v_current_hour INTEGER;
  v_hourly_resets INTEGER := 0;
  v_daily_resets INTEGER := 0;
BEGIN
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

  -- Reset contador horario se mudou a hora
  UPDATE whatsapp_sessions
  SET
    messages_sent_this_hour = 0,
    current_hour_bucket = v_current_hour,
    updated_at = NOW()
  WHERE current_hour_bucket != v_current_hour
    AND is_active = true;

  GET DIAGNOSTICS v_hourly_resets = ROW_COUNT;

  -- Reset contador diario a meia-noite (quando hora = 0 e contador > 0)
  IF v_current_hour = 0 THEN
    UPDATE whatsapp_sessions
    SET
      messages_sent_today = 0,
      updated_at = NOW()
    WHERE messages_sent_today > 0
      AND is_active = true;

    GET DIAGNOSTICS v_daily_resets = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_hourly_resets, v_daily_resets;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: get_whatsapp_session_stats
-- Estatisticas de sessoes para dashboard
-- =====================================================
CREATE OR REPLACE FUNCTION get_whatsapp_session_stats(p_campaign_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_sessions INTEGER,
  connected_sessions INTEGER,
  disconnected_sessions INTEGER,
  messages_sent_today INTEGER,
  messages_sent_total INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_sessions,
    COUNT(*) FILTER (WHERE status = 'connected')::INTEGER as connected_sessions,
    COUNT(*) FILTER (WHERE status IN ('disconnected', 'expired'))::INTEGER as disconnected_sessions,
    COALESCE(SUM(messages_sent_today), 0)::INTEGER as messages_sent_today,
    COALESCE(SUM(total_messages_sent), 0)::INTEGER as messages_sent_total
  FROM whatsapp_sessions
  WHERE is_active = true
    AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: Auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_whatsapp_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_whatsapp_session_updated ON whatsapp_sessions;
CREATE TRIGGER trigger_whatsapp_session_updated
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_session_timestamp();

-- =====================================================
-- RLS: Politicas de seguranca
-- =====================================================
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_log ENABLE ROW LEVEL SECURITY;

-- Acesso apenas via service role
CREATE POLICY whatsapp_sessions_service_role ON whatsapp_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY whatsapp_message_log_service_role ON whatsapp_message_log
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE whatsapp_sessions IS 'Sessoes WhatsApp Web via Puppeteer - 1 sessao por campanha';
COMMENT ON COLUMN whatsapp_sessions.qr_code_data IS 'QR Code em base64 - temporario, limpar apos conexao';
COMMENT ON COLUMN whatsapp_sessions.hourly_limit IS 'Limite seguro: 15/hora para evitar ban';
COMMENT ON COLUMN whatsapp_sessions.daily_limit IS 'Limite seguro: 120/dia (15/h * 8h comerciais)';

COMMENT ON TABLE whatsapp_message_log IS 'Historico de todas as mensagens WhatsApp';
COMMENT ON FUNCTION can_whatsapp_session_send IS 'Verifica rate limits e janela de horario antes de enviar';
COMMENT ON FUNCTION reset_whatsapp_rate_counters IS 'Deve ser chamado periodicamente pelo cron/heartbeat';
