-- Migration: Tabela de Prompts para Agentes IA
-- Criado: 2025-12-16
-- Objetivo: Armazenar prompts customizados por campanha e tipo de lead (outbound/inbound)

-- ============================================================================
-- TABELA: aic_agent_prompts
-- ============================================================================
CREATE TABLE IF NOT EXISTS aic_agent_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES aic_campaigns(id) ON DELETE CASCADE,

  -- Tipo de agente
  type VARCHAR(20) NOT NULL CHECK (type IN ('outbound', 'inbound')),

  -- Canal (Instagram, WhatsApp, etc.)
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('instagram', 'whatsapp', 'all')),

  -- Nome/descrição do prompt (para organização)
  name VARCHAR(255),
  description TEXT,

  -- Prompts
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT,
  greeting_message TEXT,
  fallback_message TEXT,  -- Mensagem caso AI falhe

  -- Configurações do modelo IA
  model VARCHAR(50) DEFAULT 'gpt-4o',
  temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 500 CHECK (max_tokens > 0),
  top_p DECIMAL(3,2) DEFAULT 1.0,
  frequency_penalty DECIMAL(3,2) DEFAULT 0.0,
  presence_penalty DECIMAL(3,2) DEFAULT 0.0,

  -- Versionamento e A/B Testing
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,  -- Referência ao admin que criou

  -- Constraints
  CONSTRAINT unique_campaign_type_channel_active
    UNIQUE (campaign_id, type, channel, is_active)
    WHERE is_active = true
);

-- ============================================================================
-- ÍNDICES
-- ============================================================================
CREATE INDEX idx_agent_prompts_campaign ON aic_agent_prompts(campaign_id);
CREATE INDEX idx_agent_prompts_type ON aic_agent_prompts(type);
CREATE INDEX idx_agent_prompts_channel ON aic_agent_prompts(channel);
CREATE INDEX idx_agent_prompts_active ON aic_agent_prompts(is_active);
CREATE INDEX idx_agent_prompts_campaign_type_channel ON aic_agent_prompts(campaign_id, type, channel);

-- ============================================================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION update_aic_agent_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_aic_agent_prompts_updated_at
  BEFORE UPDATE ON aic_agent_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_aic_agent_prompts_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE aic_agent_prompts ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários autenticados podem ler prompts de suas campanhas
CREATE POLICY "Users can read their campaign prompts"
  ON aic_agent_prompts
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy: Service role pode fazer tudo
CREATE POLICY "Service role can do everything"
  ON aic_agent_prompts
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- COMENTÁRIOS
-- ============================================================================
COMMENT ON TABLE aic_agent_prompts IS 'Prompts customizados para agentes IA por campanha e tipo de lead';
COMMENT ON COLUMN aic_agent_prompts.type IS 'Tipo de lead: outbound (scrapado) ou inbound (espontâneo)';
COMMENT ON COLUMN aic_agent_prompts.channel IS 'Canal de comunicação: instagram, whatsapp ou all';
COMMENT ON COLUMN aic_agent_prompts.system_prompt IS 'Prompt de sistema para o agente IA';
COMMENT ON COLUMN aic_agent_prompts.user_prompt_template IS 'Template de prompt do usuário com variáveis {{var}}';
COMMENT ON COLUMN aic_agent_prompts.greeting_message IS 'Mensagem inicial automática';
COMMENT ON COLUMN aic_agent_prompts.is_active IS 'Apenas um prompt ativo por campanha/tipo/canal';
COMMENT ON COLUMN aic_agent_prompts.version IS 'Versão do prompt para A/B testing e rollback';

-- ============================================================================
-- SEED DATA: Prompts Padrão
-- ============================================================================

-- Prompt OUTBOUND INSTAGRAM (exemplo)
INSERT INTO aic_agent_prompts (
  campaign_id, type, channel, name, description,
  system_prompt, greeting_message, model, temperature
) VALUES (
  NULL,  -- NULL = prompt padrão para todas as campanhas sem customização
  'outbound',
  'instagram',
  'Prompt Padrão Outbound Instagram',
  'Prompt genérico para leads scrapados do Instagram',

  -- System Prompt
  'Você é um especialista em qualificação de leads para o nicho da campanha.

  Contexto do lead (disponível):
  - Username: {{username}}
  - Nome: {{full_name}}
  - Bio: {{bio}}
  - Categoria: {{business_category}}
  - Localização: {{location}}
  - Seguidores: {{followers_count}}

  Missão:
  1. Mostrar que pesquisou o perfil (mencione algo específico da bio)
  2. Despertar interesse no produto/serviço da campanha
  3. Fazer uma pergunta qualificadora

  Tom: Consultivo, personalizado, não-invasivo.
  IMPORTANTE: Seja breve (máx 3 frases), conversacional.',

  -- Greeting
  'Olá {{full_name}}! Vi seu perfil de {{business_category}} e adorei seu trabalho! ✨',

  'gpt-4o',
  0.7
);

-- Prompt INBOUND INSTAGRAM (exemplo)
INSERT INTO aic_agent_prompts (
  campaign_id, type, channel, name, description,
  system_prompt, greeting_message, model, temperature
) VALUES (
  NULL,
  'inbound',
  'instagram',
  'Prompt Padrão Inbound Instagram',
  'Prompt para leads que entraram em contato espontaneamente via Instagram',

  -- System Prompt
  'Você é o atendente da campanha. O lead entrou em contato ESPONTANEAMENTE via Instagram - isso significa ALTO interesse!

  Contexto disponível:
  - Username: {{username}}
  - Nome: DESCONHECIDO (você NÃO tem dados do perfil dele)

  Missão:
  1. Dar boas-vindas calorosas e receptivas
  2. Perguntar como pode ajudar
  3. Capturar a necessidade/interesse específico
  4. Qualificar pela CONVERSA (não pelo perfil)

  Tom: Receptivo, solícito, ágil, humano.
  IMPORTANTE:
  - NÃO mencione que "viu o perfil" - você NÃO tem esses dados!
  - NÃO invente informações sobre o lead
  - Seja breve e direto (máx 2 frases)',

  -- Greeting
  'Olá! 👋 Que bom que você entrou em contato! Como posso ajudar?',

  'gpt-4o',
  0.8  -- Um pouco mais criativo para atendimento
);

-- Prompt OUTBOUND WHATSAPP (exemplo)
INSERT INTO aic_agent_prompts (
  campaign_id, type, channel, name, description,
  system_prompt, greeting_message, model, temperature
) VALUES (
  NULL,
  'outbound',
  'whatsapp',
  'Prompt Padrão Outbound WhatsApp',
  'Prompt para mensagens proativas via WhatsApp',

  -- System Prompt
  'Você é um assistente especializado em atendimento via WhatsApp.

  Contexto do contato:
  - Telefone: {{phone}}
  - Nome: {{name}}

  Missão:
  1. Apresentar o produto/serviço de forma clara
  2. Mostrar valor imediato
  3. Fazer pergunta qualificadora

  Tom: Profissional mas acessível, direto.
  IMPORTANTE: WhatsApp é mais pessoal - seja respeitoso com o tempo da pessoa.',

  -- Greeting
  'Olá {{name}}! Tudo bem? 😊',

  'gpt-4o',
  0.7
);

-- Prompt INBOUND WHATSAPP (exemplo)
INSERT INTO aic_agent_prompts (
  campaign_id, type, channel, name, description,
  system_prompt, greeting_message, model, temperature
) VALUES (
  NULL,
  'inbound',
  'whatsapp',
  'Prompt Padrão Inbound WhatsApp',
  'Prompt para contatos que iniciaram conversa via WhatsApp',

  -- System Prompt
  'Você é o atendente via WhatsApp. O contato entrou em contato ESPONTANEAMENTE - alto interesse!

  Contexto disponível:
  - Telefone: {{phone}}
  - Nome: {{name}} (do contato WhatsApp)

  Missão:
  1. Dar boas-vindas imediatas
  2. Perguntar como pode ajudar
  3. Capturar necessidade
  4. Ser ágil e objetivo

  Tom: Receptivo, ágil, profissional mas amigável.
  IMPORTANTE: WhatsApp é canal imediato - responda rápido e direto.',

  -- Greeting
  'Olá {{name}}! 👋 Como posso ajudar?',

  'gpt-4o',
  0.8
);

-- ============================================================================
-- FUNÇÃO HELPER: Buscar prompt ativo
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_prompt(
  p_campaign_id UUID,
  p_type VARCHAR(20),
  p_channel VARCHAR(20)
)
RETURNS TABLE (
  id UUID,
  system_prompt TEXT,
  greeting_message TEXT,
  model VARCHAR(50),
  temperature DECIMAL(3,2),
  max_tokens INTEGER
) AS $$
BEGIN
  -- Buscar prompt específico da campanha primeiro
  RETURN QUERY
  SELECT
    p.id,
    p.system_prompt,
    p.greeting_message,
    p.model,
    p.temperature,
    p.max_tokens
  FROM aic_agent_prompts p
  WHERE p.campaign_id = p_campaign_id
    AND p.type = p_type
    AND (p.channel = p_channel OR p.channel = 'all')
    AND p.is_active = true
  ORDER BY
    CASE WHEN p.channel = p_channel THEN 1 ELSE 2 END,  -- Priorizar canal específico
    p.version DESC
  LIMIT 1;

  -- Se não encontrar, usar prompt padrão (campaign_id = NULL)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      p.id,
      p.system_prompt,
      p.greeting_message,
      p.model,
      p.temperature,
      p.max_tokens
    FROM aic_agent_prompts p
    WHERE p.campaign_id IS NULL
      AND p.type = p_type
      AND (p.channel = p_channel OR p.channel = 'all')
      AND p.is_active = true
    ORDER BY
      CASE WHEN p.channel = p_channel THEN 1 ELSE 2 END,
      p.version DESC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_prompt IS 'Busca prompt ativo: primeiro específico da campanha, depois padrão (campaign_id=NULL)';
