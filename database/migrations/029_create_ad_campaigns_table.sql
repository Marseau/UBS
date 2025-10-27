-- Migration: Create ad_campaigns table for Facebook/Instagram Ads tracking
-- Created: 2025-10-21
-- Description: Tracks automated ad campaigns created from lead capture

CREATE TABLE IF NOT EXISTS ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Facebook/Instagram IDs
    audience_id TEXT NOT NULL,              -- Custom Audience ID from Facebook
    campaign_id TEXT NOT NULL,              -- Campaign ID from Facebook Ads
    adset_id TEXT NOT NULL,                 -- Ad Set ID from Facebook Ads
    ad_id TEXT NOT NULL,                    -- Ad ID (final creative)
    creative_id TEXT,                       -- Ad Creative ID (carousel)

    -- Campaign Context
    week_number INTEGER NOT NULL,           -- Editorial content week
    year INTEGER NOT NULL,                  -- Editorial content year
    segment TEXT,                           -- Target segment (e.g., "gestores_de_trafego")

    -- Lead Metrics
    leads_count INTEGER NOT NULL DEFAULT 0, -- Number of leads in custom audience
    leads_validated INTEGER,                -- Number of leads that passed validation

    -- Budget & Spend
    daily_budget_cents INTEGER NOT NULL,    -- Daily budget in cents (200 = R$2.00)
    total_spent_cents INTEGER DEFAULT 0,    -- Total spent so far (updated via webhook)

    -- Performance Metrics (updated via webhook/API)
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr DECIMAL(5,2),                       -- Click-through rate (%)
    cpc_cents INTEGER,                      -- Cost per click in cents
    conversions INTEGER DEFAULT 0,          -- Conversions tracked

    -- Campaign Status
    status TEXT NOT NULL DEFAULT 'active',  -- active, paused, completed, failed
    start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Indexes for common queries
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'completed', 'failed'))
);

-- Indexes for performance
CREATE INDEX idx_ad_campaigns_week_year ON ad_campaigns(week_number, year);
CREATE INDEX idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX idx_ad_campaigns_segment ON ad_campaigns(segment);
CREATE INDEX idx_ad_campaigns_campaign_id ON ad_campaigns(campaign_id);
CREATE INDEX idx_ad_campaigns_created_at ON ad_campaigns(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ad_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ad_campaigns_updated_at
    BEFORE UPDATE ON ad_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_ad_campaigns_updated_at();

-- Comments for documentation
COMMENT ON TABLE ad_campaigns IS 'Tracks automated Facebook/Instagram ad campaigns created from lead capture';
COMMENT ON COLUMN ad_campaigns.audience_id IS 'Facebook Custom Audience ID';
COMMENT ON COLUMN ad_campaigns.campaign_id IS 'Facebook Ads Campaign ID';
COMMENT ON COLUMN ad_campaigns.daily_budget_cents IS 'Daily budget in cents (200 = R$2.00)';
COMMENT ON COLUMN ad_campaigns.leads_count IS 'Number of leads uploaded to custom audience (max 2000)';
COMMENT ON COLUMN ad_campaigns.status IS 'Campaign status: active, paused, completed, failed';
