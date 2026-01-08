-- Migration: 090_aic_client_journeys.sql
-- Description: Sistema de jornada do cliente AIC com persistencia de etapas
-- Created: 2025-01-08

-- ============================================
-- TABELA: aic_client_journeys
-- State machine para rastrear progresso do cliente
-- ============================================

CREATE TABLE IF NOT EXISTS aic_client_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificacao e relacionamentos
  delivery_id UUID REFERENCES aic_lead_deliveries(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES aic_contracts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE SET NULL,
  auth_user_id UUID,

  -- Dados do cliente (copiados para facil acesso)
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(50),
  client_document VARCHAR(20),
  client_company VARCHAR(255),

  -- Estado da Jornada (State Machine)
  current_step VARCHAR(50) NOT NULL DEFAULT 'proposta_enviada',
  -- Valores possiveis:
  -- 'proposta_enviada'     -> Proposta criada, aguardando visualizacao
  -- 'proposta_visualizada' -> Cliente viu a proposta
  -- 'contrato_enviado'     -> Link do contrato enviado
  -- 'contrato_assinado'    -> Contrato assinado, campanha criada
  -- 'pagamento_pendente'   -> Aguardando pagamento (50% entrada)
  -- 'pagamento_confirmado' -> Pagamento recebido
  -- 'credenciais_pendente' -> Aguardando WhatsApp + Instagram
  -- 'credenciais_ok'       -> Credenciais configuradas
  -- 'briefing_pendente'    -> Aguardando briefing
  -- 'briefing_completo'    -> Briefing >= 80%
  -- 'campanha_ativa'       -> Outreach iniciado
  -- 'campanha_concluida'   -> 30 dias ou meta atingida

  -- Timestamps de cada etapa (audit trail completo)
  proposta_enviada_at TIMESTAMPTZ DEFAULT NOW(),
  proposta_visualizada_at TIMESTAMPTZ,
  contrato_enviado_at TIMESTAMPTZ,
  contrato_assinado_at TIMESTAMPTZ,
  pagamento_pendente_at TIMESTAMPTZ,
  pagamento_confirmado_at TIMESTAMPTZ,
  credenciais_pendente_at TIMESTAMPTZ,
  credenciais_ok_at TIMESTAMPTZ,
  briefing_pendente_at TIMESTAMPTZ,
  briefing_completo_at TIMESTAMPTZ,
  campanha_ativa_at TIMESTAMPTZ,
  campanha_concluida_at TIMESTAMPTZ,

  -- Orientacao do cliente
  next_action_message TEXT DEFAULT 'Aguarde enquanto preparamos sua proposta',
  next_action_url TEXT,

  -- Token para acesso publico (sem login)
  access_token UUID DEFAULT gen_random_uuid(),
  access_token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),

  -- Dados da proposta/campanha
  proposal_data JSONB DEFAULT '{}',
  -- Estrutura esperada:
  -- {
  --   "project_name": "...",
  --   "target_niche": "...",
  --   "service_description": "...",
  --   "target_audience": "...",
  --   "contract_value": 4000,
  --   "lead_value": 10,
  --   "campaign_duration_days": 30,
  --   "target_leads": 2000
  -- }

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255), -- admin que criou
  notes TEXT -- notas internas

);

-- ============================================
-- INDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_journeys_delivery_id ON aic_client_journeys(delivery_id);
CREATE INDEX IF NOT EXISTS idx_journeys_contract_id ON aic_client_journeys(contract_id);
CREATE INDEX IF NOT EXISTS idx_journeys_campaign_id ON aic_client_journeys(campaign_id);
CREATE INDEX IF NOT EXISTS idx_journeys_auth_user_id ON aic_client_journeys(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_journeys_current_step ON aic_client_journeys(current_step);
CREATE INDEX IF NOT EXISTS idx_journeys_access_token ON aic_client_journeys(access_token);
CREATE INDEX IF NOT EXISTS idx_journeys_client_email ON aic_client_journeys(client_email);
CREATE INDEX IF NOT EXISTS idx_journeys_created_at ON aic_client_journeys(created_at DESC);

-- ============================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ============================================

CREATE OR REPLACE FUNCTION update_journey_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_journey_updated_at ON aic_client_journeys;
CREATE TRIGGER trigger_journey_updated_at
  BEFORE UPDATE ON aic_client_journeys
  FOR EACH ROW
  EXECUTE FUNCTION update_journey_timestamp();

-- ============================================
-- TRIGGER: Atualizar timestamp da etapa automaticamente
-- ============================================

CREATE OR REPLACE FUNCTION update_journey_step_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando current_step muda, atualiza o timestamp correspondente
  IF NEW.current_step != OLD.current_step THEN
    CASE NEW.current_step
      WHEN 'proposta_enviada' THEN
        NEW.proposta_enviada_at = COALESCE(NEW.proposta_enviada_at, NOW());
      WHEN 'proposta_visualizada' THEN
        NEW.proposta_visualizada_at = COALESCE(NEW.proposta_visualizada_at, NOW());
      WHEN 'contrato_enviado' THEN
        NEW.contrato_enviado_at = COALESCE(NEW.contrato_enviado_at, NOW());
      WHEN 'contrato_assinado' THEN
        NEW.contrato_assinado_at = COALESCE(NEW.contrato_assinado_at, NOW());
      WHEN 'pagamento_pendente' THEN
        NEW.pagamento_pendente_at = COALESCE(NEW.pagamento_pendente_at, NOW());
      WHEN 'pagamento_confirmado' THEN
        NEW.pagamento_confirmado_at = COALESCE(NEW.pagamento_confirmado_at, NOW());
      WHEN 'credenciais_pendente' THEN
        NEW.credenciais_pendente_at = COALESCE(NEW.credenciais_pendente_at, NOW());
      WHEN 'credenciais_ok' THEN
        NEW.credenciais_ok_at = COALESCE(NEW.credenciais_ok_at, NOW());
      WHEN 'briefing_pendente' THEN
        NEW.briefing_pendente_at = COALESCE(NEW.briefing_pendente_at, NOW());
      WHEN 'briefing_completo' THEN
        NEW.briefing_completo_at = COALESCE(NEW.briefing_completo_at, NOW());
      WHEN 'campanha_ativa' THEN
        NEW.campanha_ativa_at = COALESCE(NEW.campanha_ativa_at, NOW());
      WHEN 'campanha_concluida' THEN
        NEW.campanha_concluida_at = COALESCE(NEW.campanha_concluida_at, NOW());
      ELSE
        -- Unknown step, do nothing
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_journey_step_timestamp ON aic_client_journeys;
CREATE TRIGGER trigger_journey_step_timestamp
  BEFORE UPDATE ON aic_client_journeys
  FOR EACH ROW
  EXECUTE FUNCTION update_journey_step_timestamp();

-- ============================================
-- FUNCAO: Validar transicao de etapa
-- ============================================

CREATE OR REPLACE FUNCTION validate_journey_step_transition(
  p_current_step VARCHAR,
  p_new_step VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  step_order TEXT[] := ARRAY[
    'proposta_enviada',
    'proposta_visualizada',
    'contrato_enviado',
    'contrato_assinado',
    'pagamento_pendente',
    'pagamento_confirmado',
    'credenciais_pendente',
    'credenciais_ok',
    'briefing_pendente',
    'briefing_completo',
    'campanha_ativa',
    'campanha_concluida'
  ];
  current_idx INTEGER;
  new_idx INTEGER;
BEGIN
  -- Encontrar indices
  SELECT array_position(step_order, p_current_step) INTO current_idx;
  SELECT array_position(step_order, p_new_step) INTO new_idx;

  -- Se etapa nao existe, rejeitar
  IF current_idx IS NULL OR new_idx IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Permitir avancar para proxima etapa ou pular para etapas especiais
  -- (ex: contrato_assinado pode ir direto para pagamento_pendente)
  RETURN new_idx >= current_idx;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCAO: Obter journey por token de acesso
-- ============================================

CREATE OR REPLACE FUNCTION get_journey_by_access_token(p_token UUID)
RETURNS TABLE (
  id UUID,
  delivery_id UUID,
  contract_id UUID,
  campaign_id UUID,
  client_name VARCHAR,
  client_email VARCHAR,
  current_step VARCHAR,
  next_action_message TEXT,
  next_action_url TEXT,
  proposal_data JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.delivery_id,
    j.contract_id,
    j.campaign_id,
    j.client_name,
    j.client_email,
    j.current_step,
    j.next_action_message,
    j.next_action_url,
    j.proposal_data,
    j.created_at
  FROM aic_client_journeys j
  WHERE j.access_token = p_token
    AND (j.access_token_expires_at IS NULL OR j.access_token_expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCAO: Calcular progresso da jornada (%)
-- ============================================

CREATE OR REPLACE FUNCTION calculate_journey_progress(p_current_step VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  step_weights JSONB := '{
    "proposta_enviada": 5,
    "proposta_visualizada": 10,
    "contrato_enviado": 15,
    "contrato_assinado": 25,
    "pagamento_pendente": 30,
    "pagamento_confirmado": 45,
    "credenciais_pendente": 50,
    "credenciais_ok": 65,
    "briefing_pendente": 70,
    "briefing_completo": 85,
    "campanha_ativa": 95,
    "campanha_concluida": 100
  }'::JSONB;
BEGIN
  RETURN COALESCE((step_weights->>p_current_step)::INTEGER, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: Jornadas com progresso calculado
-- ============================================

CREATE OR REPLACE VIEW aic_client_journeys_with_progress AS
SELECT
  j.*,
  calculate_journey_progress(j.current_step) as progress_percent,
  CASE
    WHEN j.current_step IN ('campanha_ativa', 'campanha_concluida') THEN 'active'
    WHEN j.current_step IN ('proposta_enviada', 'proposta_visualizada') THEN 'prospect'
    WHEN j.current_step IN ('contrato_enviado', 'contrato_assinado', 'pagamento_pendente') THEN 'negotiating'
    WHEN j.current_step IN ('pagamento_confirmado', 'credenciais_pendente', 'credenciais_ok', 'briefing_pendente', 'briefing_completo') THEN 'onboarding'
    ELSE 'unknown'
  END as journey_phase,
  c.campaign_name,
  c.nicho_principal,
  c.status as campaign_status
FROM aic_client_journeys j
LEFT JOIN cluster_campaigns c ON j.campaign_id = c.id;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON aic_client_journeys TO authenticated;
GRANT SELECT ON aic_client_journeys_with_progress TO authenticated;
GRANT EXECUTE ON FUNCTION get_journey_by_access_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION calculate_journey_progress(VARCHAR) TO authenticated;

-- ============================================
-- COMENTARIOS
-- ============================================

COMMENT ON TABLE aic_client_journeys IS 'State machine para rastrear jornada do cliente AIC desde proposta ate campanha concluida';
COMMENT ON COLUMN aic_client_journeys.current_step IS 'Estado atual da jornada - valores: proposta_enviada, proposta_visualizada, contrato_enviado, contrato_assinado, pagamento_pendente, pagamento_confirmado, credenciais_pendente, credenciais_ok, briefing_pendente, briefing_completo, campanha_ativa, campanha_concluida';
COMMENT ON COLUMN aic_client_journeys.access_token IS 'Token UUID para acesso publico sem login - expira em 90 dias';
COMMENT ON COLUMN aic_client_journeys.proposal_data IS 'Dados da proposta em JSON - inclui nicho, descricao, valores, etc';

-- ============================================
-- MIGRACAO DE DADOS EXISTENTES (opcional)
-- Cria journeys para deliveries que ja existem
-- ============================================

-- INSERT INTO aic_client_journeys (delivery_id, client_name, client_email, client_phone, current_step, proposal_data)
-- SELECT
--   d.id,
--   d.lead_name,
--   d.lead_email,
--   d.lead_whatsapp,
--   CASE
--     WHEN d.status = 'contrato_assinado' THEN 'contrato_assinado'
--     WHEN d.status = 'contrato_enviado' THEN 'contrato_enviado'
--     ELSE 'proposta_enviada'
--   END,
--   jsonb_build_object(
--     'contract_value', COALESCE(d.contract_value, 4000),
--     'lead_value', COALESCE(d.lead_value, 10)
--   )
-- FROM aic_lead_deliveries d
-- WHERE NOT EXISTS (
--   SELECT 1 FROM aic_client_journeys j WHERE j.delivery_id = d.id
-- );
