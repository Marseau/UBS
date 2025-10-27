/**
 * Migration 028: Taylor Made Lead Tracking Fields
 *
 * Adiciona campos para tracking de emails enviados e status da proposta
 */

-- Adicionar campos de tracking
ALTER TABLE taylor_made_leads
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS admin_email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS admin_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS proposal_in_progress BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS proposal_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_authorized BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS whatsapp_authorized_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_taylor_made_welcome_email ON taylor_made_leads(welcome_email_sent);
CREATE INDEX IF NOT EXISTS idx_taylor_made_proposal_progress ON taylor_made_leads(proposal_in_progress);
CREATE INDEX IF NOT EXISTS idx_taylor_made_whatsapp_auth ON taylor_made_leads(whatsapp_authorized);

-- Comentários das colunas
COMMENT ON COLUMN taylor_made_leads.welcome_email_sent IS 'Flag indicando se email de boas-vindas foi enviado ao lead';
COMMENT ON COLUMN taylor_made_leads.welcome_email_sent_at IS 'Timestamp do envio do email de boas-vindas';
COMMENT ON COLUMN taylor_made_leads.admin_email_sent IS 'Flag indicando se email foi enviado para admin@stratfin.tec.br';
COMMENT ON COLUMN taylor_made_leads.admin_email_sent_at IS 'Timestamp do envio do email ao admin';
COMMENT ON COLUMN taylor_made_leads.proposal_in_progress IS 'Flag indicando se proposta está sendo produzida';
COMMENT ON COLUMN taylor_made_leads.proposal_started_at IS 'Timestamp do início da produção da proposta';
COMMENT ON COLUMN taylor_made_leads.whatsapp_authorized IS 'Flag indicando se lead autorizou contato via WhatsApp';
COMMENT ON COLUMN taylor_made_leads.whatsapp_authorized_at IS 'Timestamp da autorização de contato via WhatsApp';
COMMENT ON COLUMN taylor_made_leads.notes IS 'Notas e observações sobre o lead';

-- Trigger para atualizar proposal_started_at automaticamente
CREATE OR REPLACE FUNCTION update_proposal_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.proposal_in_progress = TRUE AND OLD.proposal_in_progress = FALSE THEN
    NEW.proposal_started_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_proposal_started ON taylor_made_leads;
CREATE TRIGGER trg_update_proposal_started
  BEFORE UPDATE ON taylor_made_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_proposal_started_at();

COMMIT;
