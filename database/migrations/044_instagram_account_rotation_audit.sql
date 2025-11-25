-- =====================================================
-- MIGRATION: Sistema de Audit e Tracking de Rotação de Contas Instagram
-- Descrição: Rastreamento completo de rotações, falhas, cooldowns e saúde das contas
-- Data: 2025-11-25
-- =====================================================

-- Tabela principal de audit de rotações
CREATE TABLE IF NOT EXISTS instagram_account_rotation_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificação da conta
  account_email VARCHAR(255) NOT NULL,
  account_instagram_username VARCHAR(100) NOT NULL,

  -- Tipo de evento
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'rotation_started',        -- Início de rotação para esta conta
    'rotation_completed',      -- Rotação completada com sucesso
    'failure_registered',      -- Falha registrada
    'cooldown_started',        -- Entrou em cooldown
    'cooldown_ended',          -- Saiu de cooldown
    'session_recovered',       -- Sessão recuperada após erro
    'account_blocked',         -- Conta bloqueada pelo Instagram
    'account_unblocked',       -- Conta desbloqueada
    'manual_reset'             -- Reset manual forçado
  )),

  -- Detalhes do evento
  failure_count INTEGER DEFAULT 0,
  error_type VARCHAR(100),
  error_message TEXT,

  -- Contexto da rotação
  previous_account_email VARCHAR(255),
  previous_account_username VARCHAR(100),
  rotation_reason TEXT,

  -- Estado da conta no momento do evento
  account_state JSONB DEFAULT '{}'::JSONB,  -- Snapshot completo do AccountConfig

  -- Métricas de performance
  session_duration_ms INTEGER,
  profiles_scraped INTEGER DEFAULT 0,
  leads_captured INTEGER DEFAULT 0,

  -- Cooldown tracking
  cooldown_until TIMESTAMP WITH TIME ZONE,
  cooldown_duration_minutes INTEGER,

  -- Sistema
  server_pid INTEGER,
  server_uptime_seconds INTEGER,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance e queries comuns
CREATE INDEX idx_rotation_audit_account_email ON instagram_account_rotation_audit(account_email);
CREATE INDEX idx_rotation_audit_instagram_username ON instagram_account_rotation_audit(account_instagram_username);
CREATE INDEX idx_rotation_audit_event_type ON instagram_account_rotation_audit(event_type);
CREATE INDEX idx_rotation_audit_created_at ON instagram_account_rotation_audit(created_at DESC);
CREATE INDEX idx_rotation_audit_cooldown ON instagram_account_rotation_audit(cooldown_until) WHERE cooldown_until IS NOT NULL;

-- View: Estado atual das contas
CREATE OR REPLACE VIEW instagram_accounts_current_state AS
WITH latest_events AS (
  SELECT DISTINCT ON (account_email)
    account_email,
    account_instagram_username,
    event_type,
    failure_count,
    cooldown_until,
    created_at as last_event_at,
    account_state
  FROM instagram_account_rotation_audit
  ORDER BY account_email, created_at DESC
)
SELECT
  account_email,
  account_instagram_username,
  event_type as last_event_type,
  failure_count,
  cooldown_until,
  CASE
    WHEN cooldown_until IS NOT NULL AND cooldown_until > NOW() THEN 'in_cooldown'
    WHEN failure_count >= 3 THEN 'blocked'
    WHEN failure_count > 0 THEN 'degraded'
    ELSE 'healthy'
  END as health_status,
  CASE
    WHEN cooldown_until IS NOT NULL AND cooldown_until > NOW()
    THEN EXTRACT(EPOCH FROM (cooldown_until - NOW())) / 60
    ELSE 0
  END as cooldown_remaining_minutes,
  last_event_at,
  account_state
FROM latest_events;

COMMENT ON VIEW instagram_accounts_current_state IS 'Estado atual de saúde de cada conta Instagram baseado nos últimos eventos';

-- View: Estatísticas de rotação por conta
CREATE OR REPLACE VIEW instagram_account_rotation_stats AS
SELECT
  account_email,
  account_instagram_username,
  COUNT(*) FILTER (WHERE event_type = 'rotation_started') as total_rotations,
  COUNT(*) FILTER (WHERE event_type = 'failure_registered') as total_failures,
  COUNT(*) FILTER (WHERE event_type = 'cooldown_started') as total_cooldowns,
  COUNT(*) FILTER (WHERE event_type = 'session_recovered') as total_recoveries,
  SUM(profiles_scraped) as total_profiles_scraped,
  SUM(leads_captured) as total_leads_captured,
  AVG(session_duration_ms) as avg_session_duration_ms,
  MAX(created_at) as last_activity_at,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 3600 as hours_since_last_activity
FROM instagram_account_rotation_audit
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY account_email, account_instagram_username
ORDER BY total_rotations DESC;

COMMENT ON VIEW instagram_account_rotation_stats IS 'Estatísticas de performance e uso de cada conta (últimos 30 dias)';

-- View: Histórico de rotações recentes
CREATE OR REPLACE VIEW instagram_recent_rotations AS
SELECT
  id,
  account_email,
  account_instagram_username,
  event_type,
  rotation_reason,
  failure_count,
  error_type,
  cooldown_until,
  cooldown_remaining_minutes,
  profiles_scraped,
  leads_captured,
  created_at
FROM (
  SELECT
    id,
    account_email,
    account_instagram_username,
    event_type,
    rotation_reason,
    failure_count,
    error_type,
    cooldown_until,
    CASE
      WHEN cooldown_until IS NOT NULL AND cooldown_until > NOW()
      THEN EXTRACT(EPOCH FROM (cooldown_until - NOW())) / 60
      ELSE 0
    END as cooldown_remaining_minutes,
    profiles_scraped,
    leads_captured,
    created_at
  FROM instagram_account_rotation_audit
  WHERE created_at >= NOW() - INTERVAL '7 days'
) sub
ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW instagram_recent_rotations IS 'Últimas 100 rotações e eventos (últimos 7 dias)';

-- Função auxiliar: Registrar evento de rotação
CREATE OR REPLACE FUNCTION log_account_rotation_event(
  p_account_email VARCHAR,
  p_account_username VARCHAR,
  p_event_type VARCHAR,
  p_failure_count INTEGER DEFAULT 0,
  p_error_type VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_rotation_reason TEXT DEFAULT NULL,
  p_account_state JSONB DEFAULT '{}'::JSONB,
  p_cooldown_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_profiles_scraped INTEGER DEFAULT 0,
  p_leads_captured INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO instagram_account_rotation_audit (
    account_email,
    account_instagram_username,
    event_type,
    failure_count,
    error_type,
    error_message,
    rotation_reason,
    account_state,
    cooldown_until,
    profiles_scraped,
    leads_captured
  ) VALUES (
    p_account_email,
    p_account_username,
    p_event_type,
    p_failure_count,
    p_error_type,
    p_error_message,
    p_rotation_reason,
    p_account_state,
    p_cooldown_until,
    p_profiles_scraped,
    p_leads_captured
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_account_rotation_event IS 'Função auxiliar para registrar eventos de rotação de forma padronizada';

-- Comentários na tabela
COMMENT ON TABLE instagram_account_rotation_audit IS 'Audit trail completo de rotações, falhas e cooldowns das contas Instagram de scraping';
COMMENT ON COLUMN instagram_account_rotation_audit.account_email IS 'Email de login da conta Instagram';
COMMENT ON COLUMN instagram_account_rotation_audit.account_instagram_username IS 'Username público do Instagram (@username)';
COMMENT ON COLUMN instagram_account_rotation_audit.event_type IS 'Tipo de evento: rotation_started, failure_registered, cooldown_started, etc';
COMMENT ON COLUMN instagram_account_rotation_audit.account_state IS 'Snapshot completo do estado da conta no momento do evento (JSON)';
COMMENT ON COLUMN instagram_account_rotation_audit.cooldown_until IS 'Timestamp até quando a conta está em cooldown (NULL se não em cooldown)';
