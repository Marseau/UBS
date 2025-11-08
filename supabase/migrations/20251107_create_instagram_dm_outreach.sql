-- Migration: Tabela para rastreamento de DM outreach Instagram
-- Criado: 2025-11-07
-- Objetivo: Registrar todos os DMs enviados para leads com geração via IA

CREATE TABLE IF NOT EXISTS instagram_dm_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES instagram_leads(id) ON DELETE CASCADE,

  -- Dados do lead no momento do envio
  username VARCHAR(255) NOT NULL,
  full_name TEXT,
  business_category VARCHAR(255),

  -- Mensagem enviada
  message_text TEXT NOT NULL,
  message_generated_by VARCHAR(50) DEFAULT 'gpt-4o', -- Modelo usado
  generation_prompt TEXT, -- Prompt usado para gerar a mensagem

  -- Métricas de envio
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivery_status VARCHAR(50) DEFAULT 'sent', -- sent, failed, seen, replied
  error_message TEXT,

  -- Resposta do lead (se houver)
  reply_received_at TIMESTAMP WITH TIME ZONE,
  reply_text TEXT,
  lead_interested BOOLEAN DEFAULT false,

  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_dm_outreach_lead_id ON instagram_dm_outreach(lead_id);
CREATE INDEX idx_dm_outreach_sent_at ON instagram_dm_outreach(sent_at DESC);
CREATE INDEX idx_dm_outreach_delivery_status ON instagram_dm_outreach(delivery_status);
CREATE INDEX idx_dm_outreach_lead_interested ON instagram_dm_outreach(lead_interested) WHERE lead_interested = true;

-- RLS Policies (Multi-tenant ready)
ALTER TABLE instagram_dm_outreach ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários autenticados podem ler seus próprios DMs
CREATE POLICY "Users can read their own DM outreach"
  ON instagram_dm_outreach
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy: Service role pode fazer tudo
CREATE POLICY "Service role can do everything"
  ON instagram_dm_outreach
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comentários
COMMENT ON TABLE instagram_dm_outreach IS 'Rastreamento completo de DMs enviados para leads Instagram com mensagens geradas por IA';
COMMENT ON COLUMN instagram_dm_outreach.message_generated_by IS 'Modelo de IA usado para gerar a mensagem (gpt-4o, gpt-4, etc)';
COMMENT ON COLUMN instagram_dm_outreach.delivery_status IS 'Status da entrega: sent, failed, seen, replied';
COMMENT ON COLUMN instagram_dm_outreach.lead_interested IS 'True se lead demonstrou interesse (clicou link, respondeu positivamente, etc)';
