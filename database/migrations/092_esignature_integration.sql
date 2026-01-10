-- ============================================
-- Migration: 092_esignature_integration.sql
-- Description: Add e-signature provider integration columns
-- Author: AIC Development
-- Date: 2026-01-09
-- ============================================

-- Add e-signature columns to aic_contracts
ALTER TABLE aic_contracts
ADD COLUMN IF NOT EXISTS esignature_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS esignature_document_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS esignature_signer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS esignature_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS esignature_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES aic_client_journeys(id) ON DELETE SET NULL;

-- Create index for faster lookups by e-signature document ID
CREATE INDEX IF NOT EXISTS idx_aic_contracts_esignature_document_id
ON aic_contracts(esignature_document_id)
WHERE esignature_document_id IS NOT NULL;

-- Create index for journey_id
CREATE INDEX IF NOT EXISTS idx_aic_contracts_journey_id
ON aic_contracts(journey_id)
WHERE journey_id IS NOT NULL;

-- Add contract_id column to aic_client_journeys if not exists
ALTER TABLE aic_client_journeys
ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES aic_contracts(id) ON DELETE SET NULL;

-- Create index for contract_id lookup
CREATE INDEX IF NOT EXISTS idx_aic_client_journeys_contract_id
ON aic_client_journeys(contract_id)
WHERE contract_id IS NOT NULL;

-- Create table for e-signature webhook logs (audit trail)
CREATE TABLE IF NOT EXISTS aic_esignature_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  document_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding unprocessed webhooks
CREATE INDEX IF NOT EXISTS idx_esignature_webhooks_unprocessed
ON aic_esignature_webhooks(processed, created_at)
WHERE processed = false;

-- Index for finding webhooks by document
CREATE INDEX IF NOT EXISTS idx_esignature_webhooks_document
ON aic_esignature_webhooks(document_id, created_at);

-- Add comments for documentation
COMMENT ON COLUMN aic_contracts.esignature_provider IS 'E-signature provider: d4sign, clicksign, etc.';
COMMENT ON COLUMN aic_contracts.esignature_document_id IS 'Document ID in the e-signature provider';
COMMENT ON COLUMN aic_contracts.esignature_signer_id IS 'Signer ID or key in the e-signature provider';
COMMENT ON COLUMN aic_contracts.esignature_signed_at IS 'Timestamp when document was signed via e-signature';
COMMENT ON COLUMN aic_contracts.esignature_status IS 'Status: pending, waiting, signed, cancelled, expired';
COMMENT ON COLUMN aic_contracts.journey_id IS 'Link to client journey for tracking progress';

COMMENT ON TABLE aic_esignature_webhooks IS 'Audit log for all e-signature webhook events';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON aic_esignature_webhooks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON aic_esignature_webhooks TO service_role;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 092_esignature_integration.sql completed successfully';
END $$;
