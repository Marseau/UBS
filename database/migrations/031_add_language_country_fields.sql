-- Migration: Add language and country detection fields to instagram_leads
-- Created: 2025-10-23
-- Description: Adds language and country columns for GPT-4 Mini based detection

-- Add language column (ISO 639-1 code: pt, en, es, etc)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS language VARCHAR(10);

-- Add country column (ISO 3166-1 alpha-2 code: BR, PT, US, etc)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS country VARCHAR(10);

-- Add index for filtering by language
CREATE INDEX IF NOT EXISTS idx_instagram_leads_language
ON instagram_leads(language);

-- Add index for filtering by country
CREATE INDEX IF NOT EXISTS idx_instagram_leads_country
ON instagram_leads(country);

-- Add composite index for language + country queries
CREATE INDEX IF NOT EXISTS idx_instagram_leads_language_country
ON instagram_leads(language, country);

-- Add comment to document the fields
COMMENT ON COLUMN instagram_leads.language IS 'ISO 639-1 language code detected from bio via GPT-4 Mini (pt, en, es, etc)';
COMMENT ON COLUMN instagram_leads.country IS 'ISO 3166-1 alpha-2 country code inferred from bio via GPT-4 Mini (BR, PT, US, etc)';
