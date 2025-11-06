-- Migration: Add url_enriched flag to instagram_leads
-- Purpose: Track leads that had URL scraping enrichment performed
-- Date: 2025-11-05

-- Add url_enriched column (default FALSE for existing records)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS url_enriched BOOLEAN DEFAULT FALSE;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_instagram_leads_url_enriched
ON instagram_leads(url_enriched)
WHERE url_enriched = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN instagram_leads.url_enriched IS
'Indicates if complementary URL scraping enrichment was performed to extract email/phone from website field';
