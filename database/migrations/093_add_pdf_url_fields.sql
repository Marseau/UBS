-- Migration 093: Add PDF URL fields to aic_client_journeys
-- Stores URLs for proposal and contract PDFs uploaded to B2 storage

-- Add proposal_pdf_url field
ALTER TABLE aic_client_journeys
ADD COLUMN IF NOT EXISTS proposal_pdf_url TEXT;

-- Add contract_pdf_url field
ALTER TABLE aic_client_journeys
ADD COLUMN IF NOT EXISTS contract_pdf_url TEXT;

-- Add proposta_aceita_at timestamp (for when client accepts proposal)
ALTER TABLE aic_client_journeys
ADD COLUMN IF NOT EXISTS proposta_aceita_at TIMESTAMP WITH TIME ZONE;

-- Add contract_value and lead_value to journeys for easy access
ALTER TABLE aic_client_journeys
ADD COLUMN IF NOT EXISTS contract_value NUMERIC(12,2) DEFAULT 4000;

ALTER TABLE aic_client_journeys
ADD COLUMN IF NOT EXISTS lead_value NUMERIC(12,2) DEFAULT 10;

COMMENT ON COLUMN aic_client_journeys.proposal_pdf_url IS 'URL do PDF da proposta no B2 storage';
COMMENT ON COLUMN aic_client_journeys.contract_pdf_url IS 'URL do PDF do contrato assinado no B2 storage';
COMMENT ON COLUMN aic_client_journeys.proposta_aceita_at IS 'Data/hora em que o cliente aceitou a proposta';
COMMENT ON COLUMN aic_client_journeys.contract_value IS 'Valor do contrato em reais';
COMMENT ON COLUMN aic_client_journeys.lead_value IS 'Valor por lead qualificado em reais';
