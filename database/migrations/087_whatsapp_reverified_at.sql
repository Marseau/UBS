-- Migration 087: Add whatsapp_reverified_at column
-- Marca quando um lead foi re-verificado com o novo código de extração WhatsApp

ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS whatsapp_reverified_at TIMESTAMPTZ DEFAULT NULL;

-- Index para queries do backfill
CREATE INDEX IF NOT EXISTS idx_instagram_leads_whatsapp_reverified_at
ON instagram_leads (whatsapp_reverified_at)
WHERE whatsapp_reverified_at IS NULL;

COMMENT ON COLUMN instagram_leads.whatsapp_reverified_at IS 'Data/hora em que o lead foi re-verificado com código atualizado de extração WhatsApp';
