-- =====================================================
-- MIGRATION: WhatsApp Sessions - Whapi Integration
-- Descricao: Adiciona suporte a Whapi.cloud como canal secundario
--            Cada campanha tem 2 conexoes: Puppeteer + Whapi
-- Data: 2025-12-12
-- =====================================================

-- =====================================================
-- ADICIONAR COLUNAS WHAPI
-- =====================================================

-- Token de acesso Whapi (por campanha)
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_token TEXT;

-- Channel ID do Whapi
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_channel_id VARCHAR(100);

-- Status da conexao Whapi (independente do Puppeteer)
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_status VARCHAR(30) DEFAULT 'disconnected'
CHECK (whapi_status IS NULL OR whapi_status IN (
  'disconnected',     -- Nao configurado
  'qr_pending',       -- Aguardando scan do QR Code
  'connecting',       -- Conectando
  'connected',        -- Conectado
  'expired',          -- QR expirou
  'banned'            -- Bloqueado
));

-- QR Code do Whapi (base64)
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_qr_code_data TEXT;

-- Quando o QR foi gerado
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_qr_generated_at TIMESTAMP WITH TIME ZONE;

-- Ultima atividade via Whapi
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_last_activity_at TIMESTAMP WITH TIME ZONE;

-- Contadores separados para Whapi
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_messages_sent_today INTEGER DEFAULT 0;

ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS whapi_messages_sent_total INTEGER DEFAULT 0;

-- =====================================================
-- FUNCAO: update_whatsapp_session_whapi_status
-- Atualiza status da conexao Whapi
-- =====================================================
CREATE OR REPLACE FUNCTION update_whatsapp_session_whapi_status(
  p_session_id UUID,
  p_whapi_status VARCHAR,
  p_whapi_token TEXT DEFAULT NULL,
  p_whapi_channel_id VARCHAR DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_sessions
  SET
    whapi_status = p_whapi_status,
    whapi_token = COALESCE(p_whapi_token, whapi_token),
    whapi_channel_id = COALESCE(p_whapi_channel_id, whapi_channel_id),
    whapi_last_activity_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: get_whatsapp_dual_channel_status
-- Retorna status dos dois canais (Puppeteer + Whapi)
-- =====================================================
CREATE OR REPLACE FUNCTION get_whatsapp_dual_channel_status(p_campaign_id UUID)
RETURNS TABLE (
  session_id UUID,
  phone_number VARCHAR,
  -- Puppeteer
  puppeteer_status VARCHAR,
  puppeteer_connected BOOLEAN,
  puppeteer_can_send BOOLEAN,
  -- Whapi
  whapi_status VARCHAR,
  whapi_connected BOOLEAN,
  whapi_configured BOOLEAN,
  -- Geral
  any_channel_connected BOOLEAN,
  both_channels_connected BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ws.id as session_id,
    ws.phone_number,
    -- Puppeteer
    ws.status as puppeteer_status,
    (ws.status = 'connected') as puppeteer_connected,
    (ws.status = 'connected' AND ws.is_active) as puppeteer_can_send,
    -- Whapi
    ws.whapi_status,
    (ws.whapi_status = 'connected') as whapi_connected,
    (ws.whapi_token IS NOT NULL) as whapi_configured,
    -- Geral
    (ws.status = 'connected' OR ws.whapi_status = 'connected') as any_channel_connected,
    (ws.status = 'connected' AND ws.whapi_status = 'connected') as both_channels_connected
  FROM whatsapp_sessions ws
  WHERE ws.campaign_id = p_campaign_id
    AND ws.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON COLUMN whatsapp_sessions.whapi_token IS 'Token de acesso a API Whapi.cloud - criptografado em producao';
COMMENT ON COLUMN whatsapp_sessions.whapi_channel_id IS 'ID do channel no Whapi.cloud';
COMMENT ON COLUMN whatsapp_sessions.whapi_status IS 'Status da conexao Whapi (independente do Puppeteer)';
COMMENT ON FUNCTION get_whatsapp_dual_channel_status IS 'Retorna status unificado dos canais Puppeteer e Whapi';
