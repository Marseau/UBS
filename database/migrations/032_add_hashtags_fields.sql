-- Migration: Add hashtags fields to instagram_leads
-- Created: 2025-10-23
-- Description: Adds hashtags_bio and hashtags_posts columns (JSONB) for persona creation and campaign segmentation

-- Add hashtags_bio column (hashtags found in profile bio)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS hashtags_bio JSONB DEFAULT '[]'::jsonb;

-- Add hashtags_posts column (top 10 hashtags from recent posts)
ALTER TABLE instagram_leads
ADD COLUMN IF NOT EXISTS hashtags_posts JSONB DEFAULT '[]'::jsonb;

-- Add GIN indexes for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_instagram_leads_hashtags_bio
ON instagram_leads USING GIN(hashtags_bio);

CREATE INDEX IF NOT EXISTS idx_instagram_leads_hashtags_posts
ON instagram_leads USING GIN(hashtags_posts);

-- Add comments to document the fields
COMMENT ON COLUMN instagram_leads.hashtags_bio IS 'JSONB array of hashtags extracted from profile bio (max 10). Example: ["terapeuta", "psicologia", "saude"]';
COMMENT ON COLUMN instagram_leads.hashtags_posts IS 'JSONB array of top 10 hashtags from recent posts for persona creation. Example: ["marketing", "empreendedorismo"]';
