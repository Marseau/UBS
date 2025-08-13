-- Google Calendar Sync Tokens Migration
-- Migration: 005_google_calendar_sync_tokens.sql
-- Date: 2025-07-27
-- Purpose: Add sync token management for incremental Google Calendar synchronization

-- Create sync tokens table
CREATE TABLE IF NOT EXISTS calendar_sync_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL DEFAULT 'primary',
    sync_token TEXT NOT NULL,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one sync token per tenant/professional/calendar combination
    UNIQUE(tenant_id, professional_id, calendar_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_sync_tokens_tenant_professional 
ON calendar_sync_tokens(tenant_id, professional_id);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_tokens_last_sync 
ON calendar_sync_tokens(last_sync);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_tokens_calendar_id 
ON calendar_sync_tokens(calendar_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_calendar_sync_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_calendar_sync_tokens_updated_at
    BEFORE UPDATE ON calendar_sync_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_sync_tokens_updated_at();

-- Add RLS policies for multi-tenant security
ALTER TABLE calendar_sync_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access sync tokens for their tenant
CREATE POLICY "Users can view sync tokens for their tenant" ON calendar_sync_tokens
    FOR SELECT USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "Users can insert sync tokens for their tenant" ON calendar_sync_tokens
    FOR INSERT WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "Users can update sync tokens for their tenant" ON calendar_sync_tokens
    FOR UPDATE USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "Users can delete sync tokens for their tenant" ON calendar_sync_tokens
    FOR DELETE USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

-- Add comments for documentation
COMMENT ON TABLE calendar_sync_tokens IS 'Stores Google Calendar sync tokens for incremental synchronization per professional';
COMMENT ON COLUMN calendar_sync_tokens.tenant_id IS 'Reference to the tenant this sync token belongs to';
COMMENT ON COLUMN calendar_sync_tokens.professional_id IS 'Reference to the professional whose calendar is synced';
COMMENT ON COLUMN calendar_sync_tokens.calendar_id IS 'Google Calendar ID (default: primary)';
COMMENT ON COLUMN calendar_sync_tokens.sync_token IS 'Google Calendar sync token for incremental sync';
COMMENT ON COLUMN calendar_sync_tokens.last_sync IS 'Timestamp of the last successful sync operation';

-- Create a function to clean up old sync tokens (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_sync_tokens(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM calendar_sync_tokens 
    WHERE last_sync < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;