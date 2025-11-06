-- Migration: Add additional_emails and additional_phones JSONB columns
-- Purpose: Store multiple emails/phones found during URL scraping
-- Date: 2025-11-05

-- Add additional_emails column (JSONB array)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS additional_emails JSONB DEFAULT '[]'::jsonb;

-- Add additional_phones column (JSONB array)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS additional_phones JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN instagram_leads.additional_emails IS
'Array of additional email addresses found during URL scraping enrichment';

COMMENT ON COLUMN instagram_leads.additional_phones IS
'Array of additional phone numbers found during URL scraping enrichment';

-- Create GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_instagram_leads_additional_emails
ON instagram_leads USING GIN (additional_emails);

CREATE INDEX IF NOT EXISTS idx_instagram_leads_additional_phones
ON instagram_leads USING GIN (additional_phones);
