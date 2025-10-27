-- Migration: Add dado_enriquecido column to instagram_leads
-- Description: Track which leads have been enriched with AI to avoid re-processing
-- Date: 2025-10-22

-- Add dado_enriquecido boolean column with default false
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS dado_enriquecido BOOLEAN NOT NULL DEFAULT false;

-- Create index to optimize queries filtering by dado_enriquecido
CREATE INDEX IF NOT EXISTS idx_instagram_leads_dado_enriquecido
ON instagram_leads(dado_enriquecido);

-- Comment on column
COMMENT ON COLUMN instagram_leads.dado_enriquecido IS 'Flag indicating if lead data has been enriched with AI processing';
