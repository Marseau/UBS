-- =====================================================
-- MIGRATION: Sistema de Credenciais Seguras Instagram
-- Descrição: Tabelas para armazenamento criptografado de credenciais
--            de contas Instagram para automacao (DM/Follow/Unfollow)
-- Data: 2025-12-12
-- =====================================================

-- =====================================================
-- TABELA: instagram_accounts
-- Armazena credenciais criptografadas das contas Instagram
-- =====================================================
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relacionamento com campanha (cluster_campaigns)
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- Identificacao da conta
  account_name VARCHAR(100) NOT NULL,
  instagram_username VARCHAR(100) NOT NULL,
  instagram_user_id VARCHAR(50),

  -- Credenciais CRIPTOGRAFADAS (AES-256-GCM)
  -- NUNCA armazenar senha em texto plano!
  encrypted_password TEXT NOT NULL,
  encryption_iv VARCHAR(50) NOT NULL,
  encryption_tag VARCHAR(50) NOT NULL,

  -- Dados de sessao criptografados (cookies apos login)
  session_data_encrypted TEXT,
  session_expires_at TIMESTAMP WITH TIME ZONE,

  -- Status da conta
  status VARCHAR(30) NOT NULL DEFAULT 'pending_verification' CHECK (status IN (
    'pending_verification',  -- Aguardando verificacao inicial
    'active',                -- Conta ativa e funcionando
    'challenge_required',    -- Instagram pediu verificacao
    'session_expired',       -- Sessao expirou, precisa relogar
    'rate_limited',          -- Limite de acoes atingido
    'temporarily_blocked',   -- Bloqueio temporario
    'permanently_blocked',   -- Conta bloqueada permanentemente
    'credentials_invalid',   -- Usuario/senha incorretos
    'disabled'               -- Desativada manualmente
  )),

  -- Rate Limits (proteção contra ban)
  follows_today INTEGER DEFAULT 0,
  unfollows_today INTEGER DEFAULT 0,
  dms_sent_today INTEGER DEFAULT 0,
  follows_this_hour INTEGER DEFAULT 0,

  -- Limites configuráveis por conta
  max_follows_per_day INTEGER DEFAULT 80,
  max_unfollows_per_day INTEGER DEFAULT 60,
  max_dms_per_day INTEGER DEFAULT 50,
  max_follows_per_hour INTEGER DEFAULT 10,

  -- Janela de operacao (horarios permitidos)
  allowed_hours_start INTEGER DEFAULT 8,  -- 8h
  allowed_hours_end INTEGER DEFAULT 22,   -- 22h
  allowed_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],  -- Seg-Sex

  -- Tracking de acoes
  last_action_at TIMESTAMP WITH TIME ZONE,
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  total_dms_sent INTEGER DEFAULT 0,
  total_follows INTEGER DEFAULT 0,
  total_unfollows INTEGER DEFAULT 0,

  -- Auditoria
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_instagram_accounts_campaign ON instagram_accounts(campaign_id);
CREATE INDEX idx_instagram_accounts_username ON instagram_accounts(instagram_username);
CREATE INDEX idx_instagram_accounts_status ON instagram_accounts(status);
CREATE UNIQUE INDEX idx_instagram_accounts_unique_campaign ON instagram_accounts(campaign_id)
  WHERE status NOT IN ('disabled', 'permanently_blocked');

-- =====================================================
-- TABELA: credentials_access_log
-- Log de auditoria para acesso a credenciais sensiveis
-- =====================================================
CREATE TABLE IF NOT EXISTS credentials_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identificacao do registro acessado
  table_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(100) NOT NULL,

  -- Quem acessou
  accessed_by VARCHAR(255) NOT NULL,

  -- Tipo de acesso
  access_type VARCHAR(20) NOT NULL CHECK (access_type IN (
    'read',      -- Leitura de dados nao sensiveis
    'decrypt',   -- Descriptografia de credencial
    'update',    -- Atualizacao de credencial
    'delete'     -- Remocao de credencial
  )),

  -- Contexto
  reason TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,

  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices para queries de auditoria
CREATE INDEX idx_credentials_log_table ON credentials_access_log(table_name);
CREATE INDEX idx_credentials_log_record ON credentials_access_log(record_id);
CREATE INDEX idx_credentials_log_accessed_by ON credentials_access_log(accessed_by);
CREATE INDEX idx_credentials_log_type ON credentials_access_log(access_type);
CREATE INDEX idx_credentials_log_created ON credentials_access_log(created_at DESC);

-- =====================================================
-- FUNCAO: check_instagram_account_rate_limit
-- Verifica se a conta pode executar acoes
-- =====================================================
CREATE OR REPLACE FUNCTION check_instagram_account_rate_limit(p_account_id UUID)
RETURNS TABLE (
  can_follow BOOLEAN,
  can_unfollow BOOLEAN,
  can_dm BOOLEAN,
  follows_remaining_today INTEGER,
  follows_remaining_hour INTEGER,
  unfollows_remaining_today INTEGER,
  dms_remaining_today INTEGER,
  is_within_hours BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_account RECORD;
  v_current_hour INTEGER;
  v_current_day INTEGER;
  v_is_within_hours BOOLEAN;
  v_is_allowed_day BOOLEAN;
BEGIN
  -- Buscar dados da conta
  SELECT * INTO v_account FROM instagram_accounts WHERE id = p_account_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, false, false, 0, 0, 0, 0, false, 'Conta nao encontrada'::TEXT;
    RETURN;
  END IF;

  -- Verificar status
  IF v_account.status != 'active' THEN
    RETURN QUERY SELECT
      false, false, false, 0, 0, 0, 0, false,
      ('Conta em status: ' || v_account.status)::TEXT;
    RETURN;
  END IF;

  -- Hora e dia atuais
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;
  v_current_day := EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INTEGER;

  -- Verificar janela de horario
  v_is_within_hours := v_current_hour >= v_account.allowed_hours_start
                   AND v_current_hour < v_account.allowed_hours_end;
  v_is_allowed_day := v_current_day = ANY(v_account.allowed_days);

  IF NOT v_is_within_hours OR NOT v_is_allowed_day THEN
    RETURN QUERY SELECT
      false, false, false,
      (v_account.max_follows_per_day - v_account.follows_today)::INTEGER,
      (v_account.max_follows_per_hour - v_account.follows_this_hour)::INTEGER,
      (v_account.max_unfollows_per_day - v_account.unfollows_today)::INTEGER,
      (v_account.max_dms_per_day - v_account.dms_sent_today)::INTEGER,
      false,
      'Fora da janela de operacao'::TEXT;
    RETURN;
  END IF;

  -- Retornar status completo
  RETURN QUERY SELECT
    (v_account.follows_today < v_account.max_follows_per_day
     AND v_account.follows_this_hour < v_account.max_follows_per_hour)::BOOLEAN,
    (v_account.unfollows_today < v_account.max_unfollows_per_day)::BOOLEAN,
    (v_account.dms_sent_today < v_account.max_dms_per_day)::BOOLEAN,
    GREATEST(0, v_account.max_follows_per_day - v_account.follows_today)::INTEGER,
    GREATEST(0, v_account.max_follows_per_hour - v_account.follows_this_hour)::INTEGER,
    GREATEST(0, v_account.max_unfollows_per_day - v_account.unfollows_today)::INTEGER,
    GREATEST(0, v_account.max_dms_per_day - v_account.dms_sent_today)::INTEGER,
    true,
    'OK'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: increment_instagram_action
-- Incrementa contador de acao
-- =====================================================
CREATE OR REPLACE FUNCTION increment_instagram_action(
  p_account_id UUID,
  p_action_type VARCHAR
) RETURNS VOID AS $$
BEGIN
  UPDATE instagram_accounts
  SET
    follows_today = CASE WHEN p_action_type = 'follow' THEN follows_today + 1 ELSE follows_today END,
    follows_this_hour = CASE WHEN p_action_type = 'follow' THEN follows_this_hour + 1 ELSE follows_this_hour END,
    unfollows_today = CASE WHEN p_action_type = 'unfollow' THEN unfollows_today + 1 ELSE unfollows_today END,
    dms_sent_today = CASE WHEN p_action_type = 'dm' THEN dms_sent_today + 1 ELSE dms_sent_today END,
    total_follows = CASE WHEN p_action_type = 'follow' THEN total_follows + 1 ELSE total_follows END,
    total_unfollows = CASE WHEN p_action_type = 'unfollow' THEN total_unfollows + 1 ELSE total_unfollows END,
    total_dms_sent = CASE WHEN p_action_type = 'dm' THEN total_dms_sent + 1 ELSE total_dms_sent END,
    last_action_at = NOW(),
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: reset_daily_counters
-- Reset automatico de contadores diarios (executar via CRON)
-- =====================================================
CREATE OR REPLACE FUNCTION reset_instagram_daily_counters()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE instagram_accounts
  SET
    follows_today = 0,
    unfollows_today = 0,
    dms_sent_today = 0,
    updated_at = NOW()
  WHERE status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCAO: reset_hourly_counters
-- Reset de contadores por hora
-- =====================================================
CREATE OR REPLACE FUNCTION reset_instagram_hourly_counters()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE instagram_accounts
  SET
    follows_this_hour = 0,
    updated_at = NOW()
  WHERE status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS: Politicas de seguranca
-- =====================================================
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials_access_log ENABLE ROW LEVEL SECURITY;

-- Acesso apenas via service role ou admin
CREATE POLICY instagram_accounts_service_role ON instagram_accounts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY credentials_log_service_role ON credentials_access_log
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE instagram_accounts IS 'Contas Instagram para automacao com credenciais criptografadas (AES-256-GCM)';
COMMENT ON COLUMN instagram_accounts.encrypted_password IS 'Senha criptografada - NUNCA descriptografar sem auditoria';
COMMENT ON COLUMN instagram_accounts.encryption_iv IS 'Initialization Vector da criptografia (unico por registro)';
COMMENT ON COLUMN instagram_accounts.encryption_tag IS 'Authentication Tag do AES-GCM (garante integridade)';
COMMENT ON COLUMN instagram_accounts.session_data_encrypted IS 'Cookies de sessao criptografados (preferivel a usar senha)';

COMMENT ON TABLE credentials_access_log IS 'Audit trail obrigatorio para qualquer acesso a credenciais';
COMMENT ON COLUMN credentials_access_log.access_type IS 'decrypt = descriptografia de senha (alto risco, sempre logado)';
