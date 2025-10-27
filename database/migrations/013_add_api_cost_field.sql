-- Migration: Add api_cost_usd to editorial_content table
-- Created: 2025-10-04
-- Purpose: Track OpenAI API cost per content generation execution

ALTER TABLE editorial_content
ADD COLUMN IF NOT EXISTS api_cost_usd DECIMAL(10,6) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN editorial_content.api_cost_usd IS 'Total API cost in USD for this content generation (same for all 7 days of the week)';

-- Create index for cost analysis queries
CREATE INDEX IF NOT EXISTS idx_editorial_api_cost ON editorial_content(api_cost_usd, created_at);
