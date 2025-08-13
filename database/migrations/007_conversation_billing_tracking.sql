-- Conversation Billing Tracking System
-- Creates tables for tracking billable WhatsApp conversations
-- Supports the new conversation-based billing model

-- Create enum for conversation types
CREATE TYPE conversation_billing_type AS ENUM (
    'user_initiated',
    'business_initiated',
    'business_initiated_template',
    'service_conversation',
    'marketing_conversation'
);

-- Create enum for billing plans
CREATE TYPE billing_plan_type AS ENUM (
    'basico',
    'profissional',
    'enterprise',
    'custom'
);

-- Create conversation billing tracking table
CREATE TABLE IF NOT EXISTS conversation_billing_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Conversation details
    phone_number VARCHAR(20) NOT NULL,
    conversation_type conversation_billing_type NOT NULL DEFAULT 'user_initiated',
    
    -- Billing information
    billing_plan billing_plan_type NOT NULL DEFAULT 'basico',
    plan_limit INTEGER NOT NULL DEFAULT 200,
    is_overage BOOLEAN DEFAULT false,
    billing_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Billing period
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,
    
    -- WhatsApp conversation metadata
    whatsapp_conversation_id VARCHAR(100), -- WhatsApp's conversation ID if available
    message_count INTEGER DEFAULT 1,
    first_message_timestamp TIMESTAMPTZ DEFAULT now(),
    last_message_timestamp TIMESTAMPTZ DEFAULT now(),
    
    -- Pricing metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_billing_period CHECK (billing_period_end > billing_period_start),
    CONSTRAINT valid_billing_amount CHECK (billing_amount >= 0),
    CONSTRAINT valid_plan_limit CHECK (plan_limit > 0),
    CONSTRAINT valid_message_count CHECK (message_count > 0)
);

-- Create indexes for performance
CREATE INDEX idx_conversation_billing_tenant_id ON conversation_billing_tracking(tenant_id);
CREATE INDEX idx_conversation_billing_phone ON conversation_billing_tracking(phone_number);
CREATE INDEX idx_conversation_billing_period ON conversation_billing_tracking(billing_period_start, billing_period_end);
CREATE INDEX idx_conversation_billing_created_at ON conversation_billing_tracking(created_at);
CREATE INDEX idx_conversation_billing_type ON conversation_billing_tracking(conversation_type);
CREATE INDEX idx_conversation_billing_overage ON conversation_billing_tracking(is_overage);
CREATE INDEX idx_conversation_billing_plan ON conversation_billing_tracking(billing_plan);

-- Composite index for billing period queries
CREATE INDEX idx_conversation_billing_tenant_period ON conversation_billing_tracking(tenant_id, billing_period_start, billing_period_end);

-- Create billing summary materialized view
CREATE MATERIALIZED VIEW conversation_billing_summary AS
SELECT 
    tenant_id,
    billing_plan,
    billing_period_start,
    billing_period_end,
    COUNT(*) as total_conversations,
    COUNT(*) FILTER (WHERE NOT is_overage) as included_conversations,
    COUNT(*) FILTER (WHERE is_overage) as overage_conversations,
    SUM(billing_amount) as total_billing_amount,
    SUM(billing_amount) FILTER (WHERE is_overage) as overage_amount,
    MIN(created_at) as first_conversation,
    MAX(created_at) as last_conversation,
    COUNT(DISTINCT phone_number) as unique_customers,
    AVG(message_count) as avg_messages_per_conversation,
    
    -- Conversation type breakdown
    COUNT(*) FILTER (WHERE conversation_type = 'user_initiated') as user_initiated_count,
    COUNT(*) FILTER (WHERE conversation_type = 'business_initiated') as business_initiated_count,
    COUNT(*) FILTER (WHERE conversation_type = 'business_initiated_template') as template_initiated_count,
    COUNT(*) FILTER (WHERE conversation_type = 'service_conversation') as service_conversation_count,
    COUNT(*) FILTER (WHERE conversation_type = 'marketing_conversation') as marketing_conversation_count
    
FROM conversation_billing_tracking
GROUP BY 
    tenant_id, 
    billing_plan, 
    billing_period_start, 
    billing_period_end;

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_conversation_billing_summary_unique 
ON conversation_billing_summary(tenant_id, billing_plan, billing_period_start, billing_period_end);

-- Create RLS policies
ALTER TABLE conversation_billing_tracking ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for billing tracking
CREATE POLICY tenant_isolation_conversation_billing ON conversation_billing_tracking
    FOR ALL
    USING (
        tenant_id = (
            SELECT value::uuid 
            FROM app_settings 
            WHERE key = 'current_tenant_id'
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_conversation_billing_updated_at ON conversation_billing_tracking;
CREATE TRIGGER trigger_update_conversation_billing_updated_at
    BEFORE UPDATE ON conversation_billing_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_billing_updated_at();

-- Function to get current billing period usage for a tenant
CREATE OR REPLACE FUNCTION get_tenant_billing_usage(
    p_tenant_id UUID,
    p_billing_period_start TIMESTAMPTZ DEFAULT NULL,
    p_billing_period_end TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    total_conversations INTEGER,
    included_conversations INTEGER,
    overage_conversations INTEGER,
    total_cost DECIMAL,
    overage_cost DECIMAL,
    plan_limit INTEGER,
    usage_percentage DECIMAL
) AS $$
DECLARE
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_plan_limit INTEGER;
BEGIN
    -- Use provided dates or current billing period (month)
    v_period_start := COALESCE(p_billing_period_start, date_trunc('month', now()));
    v_period_end := COALESCE(p_billing_period_end, (date_trunc('month', now()) + interval '1 month' - interval '1 second'));
    
    -- Get plan limit from most recent conversation
    SELECT plan_limit INTO v_plan_limit
    FROM conversation_billing_tracking
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    v_plan_limit := COALESCE(v_plan_limit, 200); -- Default to basico plan
    
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_conversations,
        COUNT(*) FILTER (WHERE NOT is_overage)::INTEGER as included_conversations,
        COUNT(*) FILTER (WHERE is_overage)::INTEGER as overage_conversations,
        COALESCE(SUM(billing_amount), 0)::DECIMAL as total_cost,
        COALESCE(SUM(billing_amount) FILTER (WHERE is_overage), 0)::DECIMAL as overage_cost,
        v_plan_limit as plan_limit,
        CASE 
            WHEN v_plan_limit > 0 THEN (COUNT(*)::DECIMAL / v_plan_limit * 100)
            ELSE 0
        END as usage_percentage
    FROM conversation_billing_tracking
    WHERE 
        tenant_id = p_tenant_id
        AND created_at >= v_period_start
        AND created_at <= v_period_end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically mark overage conversations
CREATE OR REPLACE FUNCTION mark_overage_conversations()
RETURNS INTEGER AS $$
DECLARE
    rec RECORD;
    overage_count INTEGER := 0;
    conversation_num INTEGER;
BEGIN
    -- Process each tenant's current billing period
    FOR rec IN 
        SELECT DISTINCT 
            tenant_id,
            billing_plan,
            plan_limit,
            billing_period_start,
            billing_period_end
        FROM conversation_billing_tracking
        WHERE 
            billing_period_start <= now()
            AND billing_period_end >= now()
            AND NOT is_overage
    LOOP
        -- Number conversations in order and mark overage
        WITH numbered_conversations AS (
            SELECT 
                id,
                ROW_NUMBER() OVER (ORDER BY created_at) as conversation_number
            FROM conversation_billing_tracking
            WHERE 
                tenant_id = rec.tenant_id
                AND billing_period_start = rec.billing_period_start
                AND billing_period_end = rec.billing_period_end
        )
        UPDATE conversation_billing_tracking
        SET 
            is_overage = true,
            billing_amount = 0.25, -- Overage price
            updated_at = now()
        FROM numbered_conversations nc
        WHERE 
            conversation_billing_tracking.id = nc.id
            AND nc.conversation_number > rec.plan_limit
            AND NOT conversation_billing_tracking.is_overage;
        
        GET DIAGNOSTICS conversation_num = ROW_COUNT;
        overage_count := overage_count + conversation_num;
    END LOOP;
    
    RETURN overage_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get billing analytics for a tenant
CREATE OR REPLACE FUNCTION get_billing_analytics(
    p_tenant_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
) RETURNS TABLE (
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    total_conversations INTEGER,
    conversation_types JSONB,
    daily_breakdown JSONB,
    billing_summary JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH conversation_data AS (
        SELECT *
        FROM conversation_billing_tracking
        WHERE 
            tenant_id = p_tenant_id
            AND created_at >= p_start_date
            AND created_at <= p_end_date
    ),
    type_breakdown AS (
        SELECT jsonb_object_agg(
            conversation_type::text,
            type_count
        ) as types
        FROM (
            SELECT 
                conversation_type,
                COUNT(*) as type_count
            FROM conversation_data
            GROUP BY conversation_type
        ) t
    ),
    daily_breakdown AS (
        SELECT jsonb_object_agg(
            conversation_date::text,
            daily_count
        ) as daily
        FROM (
            SELECT 
                DATE(created_at) as conversation_date,
                COUNT(*) as daily_count
            FROM conversation_data
            GROUP BY DATE(created_at)
            ORDER BY conversation_date
        ) d
    ),
    billing_summary AS (
        SELECT jsonb_build_object(
            'total_conversations', COUNT(*),
            'included_conversations', COUNT(*) FILTER (WHERE NOT is_overage),
            'overage_conversations', COUNT(*) FILTER (WHERE is_overage),
            'total_cost', COALESCE(SUM(billing_amount), 0),
            'overage_cost', COALESCE(SUM(billing_amount) FILTER (WHERE is_overage), 0),
            'unique_customers', COUNT(DISTINCT phone_number),
            'avg_messages_per_conversation', AVG(message_count)
        ) as summary
        FROM conversation_data
    )
    SELECT 
        p_start_date,
        p_end_date,
        (SELECT COUNT(*)::INTEGER FROM conversation_data),
        COALESCE(type_breakdown.types, '{}'::jsonb),
        COALESCE(daily_breakdown.daily, '{}'::jsonb),
        billing_summary.summary
    FROM type_breakdown, daily_breakdown, billing_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh billing summary materialized view
CREATE OR REPLACE FUNCTION refresh_billing_summary()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_billing_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON conversation_billing_tracking TO authenticated;
GRANT SELECT ON conversation_billing_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_billing_usage(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_billing_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_billing_summary() TO authenticated;

-- Insert default billing settings
INSERT INTO app_settings (key, value, description, created_at) 
VALUES 
    ('billing_overage_price_brl', '0.25', 'Price per conversation over plan limit (BRL)', now()),
    ('billing_plan_basico_limit', '200', 'Conversation limit for basic plan', now()),
    ('billing_plan_profissional_limit', '400', 'Conversation limit for professional plan', now()),
    ('billing_plan_enterprise_limit', '1250', 'Conversation limit for enterprise plan', now()),
    ('billing_auto_process_overage', 'true', 'Automatically process overage billing', now())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = now();

-- Create scheduled job to process overage billing (example for pg_cron)
-- SELECT cron.schedule('process-conversation-overage', '0 1 * * *', 'SELECT mark_overage_conversations();');
-- SELECT cron.schedule('refresh-billing-summary', '*/15 * * * *', 'SELECT refresh_billing_summary();');

COMMENT ON TABLE conversation_billing_tracking IS 'Tracks billable WhatsApp conversations for the new conversation-based billing model';
COMMENT ON MATERIALIZED VIEW conversation_billing_summary IS 'Aggregated billing summary for faster reporting and analytics';
COMMENT ON FUNCTION get_tenant_billing_usage(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS 'Get current billing usage for a tenant in a specific period';
COMMENT ON FUNCTION get_billing_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS 'Get comprehensive billing analytics for a tenant';
COMMENT ON FUNCTION mark_overage_conversations() IS 'Automatically mark conversations that exceed plan limits as overage';