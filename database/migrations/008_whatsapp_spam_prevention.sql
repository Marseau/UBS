-- WhatsApp Spam Prevention System
-- Creates tables for tracking spam attempts and prevention metrics
-- Supports comprehensive anti-spam compliance

-- Create enum for risk levels
CREATE TYPE spam_risk_level AS ENUM (
    'low',
    'medium', 
    'high',
    'critical'
);

-- Create spam attempts tracking table
CREATE TABLE IF NOT EXISTS whatsapp_spam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Message details
    phone_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    content_preview TEXT, -- First 100 chars for analysis
    content_hash VARCHAR(64), -- Hash for duplicate detection
    
    -- Spam analysis
    risk_level spam_risk_level NOT NULL,
    spam_reasons TEXT[] DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    was_blocked BOOLEAN DEFAULT false,
    
    -- Detection metadata
    frequency_score INTEGER DEFAULT 0,
    content_score INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Indexes for performance
    CONSTRAINT valid_content_preview_length CHECK (length(content_preview) <= 100)
);

-- Create indexes for spam attempts
CREATE INDEX idx_whatsapp_spam_attempts_tenant_id ON whatsapp_spam_attempts(tenant_id);
CREATE INDEX idx_whatsapp_spam_attempts_phone ON whatsapp_spam_attempts(phone_number);
CREATE INDEX idx_whatsapp_spam_attempts_risk_level ON whatsapp_spam_attempts(risk_level);
CREATE INDEX idx_whatsapp_spam_attempts_created_at ON whatsapp_spam_attempts(created_at);
CREATE INDEX idx_whatsapp_spam_attempts_was_blocked ON whatsapp_spam_attempts(was_blocked);
CREATE INDEX idx_whatsapp_spam_attempts_content_hash ON whatsapp_spam_attempts(content_hash);

-- Create message frequency tracking table
CREATE TABLE IF NOT EXISTS whatsapp_message_frequency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Frequency tracking
    phone_number VARCHAR(20) NOT NULL,
    message_count_1h INTEGER DEFAULT 0,
    message_count_24h INTEGER DEFAULT 0,
    message_count_7d INTEGER DEFAULT 0,
    
    -- Engagement metrics
    total_sent INTEGER DEFAULT 0,
    total_received INTEGER DEFAULT 0,
    response_rate DECIMAL(4,3) DEFAULT 0.000,
    last_response_at TIMESTAMPTZ,
    
    -- Risk indicators
    rapid_fire_count INTEGER DEFAULT 0,
    duplicate_content_count INTEGER DEFAULT 0,
    spam_keyword_count INTEGER DEFAULT 0,
    
    -- Template tracking
    template_messages_24h INTEGER DEFAULT 0,
    last_template_sent_at TIMESTAMPTZ,
    
    -- Reset timestamps
    last_reset_1h TIMESTAMPTZ DEFAULT now(),
    last_reset_24h TIMESTAMPTZ DEFAULT now(),
    last_reset_7d TIMESTAMPTZ DEFAULT now(),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT unique_tenant_phone_frequency UNIQUE (tenant_id, phone_number),
    CONSTRAINT valid_response_rate CHECK (response_rate >= 0 AND response_rate <= 1),
    CONSTRAINT valid_message_counts CHECK (
        message_count_1h >= 0 AND 
        message_count_24h >= 0 AND 
        message_count_7d >= 0
    )
);

-- Create indexes for frequency tracking
CREATE INDEX idx_whatsapp_message_frequency_tenant_id ON whatsapp_message_frequency(tenant_id);
CREATE INDEX idx_whatsapp_message_frequency_phone ON whatsapp_message_frequency(phone_number);
CREATE INDEX idx_whatsapp_message_frequency_response_rate ON whatsapp_message_frequency(response_rate);
CREATE INDEX idx_whatsapp_message_frequency_last_reset ON whatsapp_message_frequency(last_reset_24h);

-- Create content analysis table for duplicate detection
CREATE TABLE IF NOT EXISTS whatsapp_content_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Content fingerprinting
    content_hash VARCHAR(64) NOT NULL,
    content_preview TEXT,
    usage_count INTEGER DEFAULT 1,
    
    -- Spam indicators
    spam_keywords TEXT[] DEFAULT '{}',
    has_excessive_caps BOOLEAN DEFAULT false,
    has_excessive_punctuation BOOLEAN DEFAULT false,
    message_length INTEGER DEFAULT 0,
    
    -- Distribution tracking
    unique_recipients INTEGER DEFAULT 1,
    first_used_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ DEFAULT now(),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT unique_tenant_content_hash UNIQUE (tenant_id, content_hash),
    CONSTRAINT valid_usage_count CHECK (usage_count > 0),
    CONSTRAINT valid_unique_recipients CHECK (unique_recipients > 0)
);

-- Create indexes for content analysis
CREATE INDEX idx_whatsapp_content_analysis_tenant_id ON whatsapp_content_analysis(tenant_id);
CREATE INDEX idx_whatsapp_content_analysis_content_hash ON whatsapp_content_analysis(content_hash);
CREATE INDEX idx_whatsapp_content_analysis_usage_count ON whatsapp_content_analysis(usage_count);
CREATE INDEX idx_whatsapp_content_analysis_last_used ON whatsapp_content_analysis(last_used_at);

-- Create RLS policies
ALTER TABLE whatsapp_spam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_frequency ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_content_analysis ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation_whatsapp_spam_attempts ON whatsapp_spam_attempts
    FOR ALL
    USING (
        tenant_id = (
            SELECT value::uuid 
            FROM app_settings 
            WHERE key = 'current_tenant_id'
        )
    );

CREATE POLICY tenant_isolation_whatsapp_message_frequency ON whatsapp_message_frequency
    FOR ALL
    USING (
        tenant_id = (
            SELECT value::uuid 
            FROM app_settings 
            WHERE key = 'current_tenant_id'
        )
    );

CREATE POLICY tenant_isolation_whatsapp_content_analysis ON whatsapp_content_analysis
    FOR ALL
    USING (
        tenant_id = (
            SELECT value::uuid 
            FROM app_settings 
            WHERE key = 'current_tenant_id'
        )
    );

-- Function to update message frequency counters
CREATE OR REPLACE FUNCTION update_message_frequency(
    p_tenant_id UUID,
    p_phone_number VARCHAR(20),
    p_is_outgoing BOOLEAN DEFAULT true
) RETURNS VOID AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_1h_ago TIMESTAMPTZ := v_now - INTERVAL '1 hour';
    v_24h_ago TIMESTAMPTZ := v_now - INTERVAL '24 hours';
    v_7d_ago TIMESTAMPTZ := v_now - INTERVAL '7 days';
    v_frequency_record RECORD;
BEGIN
    -- Get or create frequency record
    SELECT * INTO v_frequency_record
    FROM whatsapp_message_frequency
    WHERE tenant_id = p_tenant_id AND phone_number = p_phone_number;
    
    IF v_frequency_record IS NULL THEN
        -- Create new record
        INSERT INTO whatsapp_message_frequency (
            tenant_id,
            phone_number,
            message_count_1h,
            message_count_24h,
            message_count_7d,
            total_sent,
            total_received,
            last_reset_1h,
            last_reset_24h,
            last_reset_7d
        ) VALUES (
            p_tenant_id,
            p_phone_number,
            CASE WHEN p_is_outgoing THEN 1 ELSE 0 END,
            CASE WHEN p_is_outgoing THEN 1 ELSE 0 END,
            CASE WHEN p_is_outgoing THEN 1 ELSE 0 END,
            CASE WHEN p_is_outgoing THEN 1 ELSE 0 END,
            CASE WHEN p_is_outgoing THEN 0 ELSE 1 END,
            v_now,
            v_now,
            v_now
        );
    ELSE
        -- Reset counters if time windows have passed
        UPDATE whatsapp_message_frequency
        SET 
            message_count_1h = CASE 
                WHEN last_reset_1h < v_1h_ago THEN 
                    CASE WHEN p_is_outgoing THEN 1 ELSE message_count_1h END
                ELSE 
                    CASE WHEN p_is_outgoing THEN message_count_1h + 1 ELSE message_count_1h END
            END,
            message_count_24h = CASE 
                WHEN last_reset_24h < v_24h_ago THEN 
                    CASE WHEN p_is_outgoing THEN 1 ELSE message_count_24h END
                ELSE 
                    CASE WHEN p_is_outgoing THEN message_count_24h + 1 ELSE message_count_24h END
            END,
            message_count_7d = CASE 
                WHEN last_reset_7d < v_7d_ago THEN 
                    CASE WHEN p_is_outgoing THEN 1 ELSE message_count_7d END
                ELSE 
                    CASE WHEN p_is_outgoing THEN message_count_7d + 1 ELSE message_count_7d END
            END,
            total_sent = CASE WHEN p_is_outgoing THEN total_sent + 1 ELSE total_sent END,
            total_received = CASE WHEN p_is_outgoing THEN total_received ELSE total_received + 1 END,
            response_rate = CASE 
                WHEN total_sent > 0 THEN total_received::DECIMAL / total_sent 
                ELSE 0 
            END,
            last_response_at = CASE WHEN NOT p_is_outgoing THEN v_now ELSE last_response_at END,
            last_reset_1h = CASE WHEN last_reset_1h < v_1h_ago THEN v_now ELSE last_reset_1h END,
            last_reset_24h = CASE WHEN last_reset_24h < v_24h_ago THEN v_now ELSE last_reset_24h END,
            last_reset_7d = CASE WHEN last_reset_7d < v_7d_ago THEN v_now ELSE last_reset_7d END,
            updated_at = v_now
        WHERE tenant_id = p_tenant_id AND phone_number = p_phone_number;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track content usage and detect duplicates
CREATE OR REPLACE FUNCTION track_content_usage(
    p_tenant_id UUID,
    p_content_hash VARCHAR(64),
    p_content_preview TEXT,
    p_phone_number VARCHAR(20),
    p_spam_indicators JSONB DEFAULT '{}'
) RETURNS INTEGER AS $$
DECLARE
    v_usage_count INTEGER;
    v_unique_recipients INTEGER;
BEGIN
    -- Insert or update content analysis
    INSERT INTO whatsapp_content_analysis (
        tenant_id,
        content_hash,
        content_preview,
        usage_count,
        unique_recipients,
        spam_keywords,
        has_excessive_caps,
        has_excessive_punctuation,
        message_length,
        last_used_at
    ) VALUES (
        p_tenant_id,
        p_content_hash,
        p_content_preview,
        1,
        1,
        COALESCE((p_spam_indicators->>'spam_keywords')::TEXT[], '{}'),
        COALESCE((p_spam_indicators->>'has_excessive_caps')::BOOLEAN, false),
        COALESCE((p_spam_indicators->>'has_excessive_punctuation')::BOOLEAN, false),
        COALESCE((p_spam_indicators->>'message_length')::INTEGER, 0),
        now()
    )
    ON CONFLICT (tenant_id, content_hash) DO UPDATE SET
        usage_count = whatsapp_content_analysis.usage_count + 1,
        unique_recipients = whatsapp_content_analysis.unique_recipients + 
            CASE WHEN EXISTS (
                SELECT 1 FROM whatsapp_spam_attempts 
                WHERE tenant_id = p_tenant_id 
                AND content_hash = p_content_hash 
                AND phone_number = p_phone_number
            ) THEN 0 ELSE 1 END,
        last_used_at = now(),
        updated_at = now()
    RETURNING usage_count INTO v_usage_count;
    
    RETURN v_usage_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get spam risk assessment
CREATE OR REPLACE FUNCTION get_spam_risk_assessment(
    p_tenant_id UUID,
    p_phone_number VARCHAR(20)
) RETURNS TABLE (
    risk_level spam_risk_level,
    frequency_risk INTEGER,
    engagement_risk INTEGER,
    content_risk INTEGER,
    overall_score INTEGER,
    recommendations TEXT[]
) AS $$
DECLARE
    v_frequency_data RECORD;
    v_spam_history_count INTEGER;
    v_recommendations TEXT[] := '{}';
    v_frequency_risk INTEGER := 0;
    v_engagement_risk INTEGER := 0;
    v_content_risk INTEGER := 0;
    v_overall_score INTEGER;
    v_risk_level spam_risk_level;
BEGIN
    -- Get frequency data
    SELECT * INTO v_frequency_data
    FROM whatsapp_message_frequency
    WHERE tenant_id = p_tenant_id AND phone_number = p_phone_number;
    
    -- Get spam history
    SELECT COUNT(*) INTO v_spam_history_count
    FROM whatsapp_spam_attempts
    WHERE tenant_id = p_tenant_id 
    AND phone_number = p_phone_number
    AND created_at > (now() - INTERVAL '30 days');
    
    -- Calculate frequency risk (0-100)
    IF v_frequency_data IS NOT NULL THEN
        v_frequency_risk := LEAST(100, 
            (v_frequency_data.message_count_1h * 10) + 
            (v_frequency_data.message_count_24h * 2) + 
            (v_frequency_data.rapid_fire_count * 20)
        );
        
        IF v_frequency_data.message_count_1h > 10 THEN
            v_recommendations := array_append(v_recommendations, 'Reduce message frequency per hour');
        END IF;
        
        IF v_frequency_data.message_count_24h > 50 THEN
            v_recommendations := array_append(v_recommendations, 'Reduce daily message volume');
        END IF;
    END IF;
    
    -- Calculate engagement risk (0-100)
    IF v_frequency_data IS NOT NULL AND v_frequency_data.total_sent > 10 THEN
        v_engagement_risk := CASE 
            WHEN v_frequency_data.response_rate < 0.05 THEN 80
            WHEN v_frequency_data.response_rate < 0.10 THEN 60
            WHEN v_frequency_data.response_rate < 0.20 THEN 40
            WHEN v_frequency_data.response_rate < 0.30 THEN 20
            ELSE 0
        END;
        
        IF v_frequency_data.response_rate < 0.10 THEN
            v_recommendations := array_append(v_recommendations, 'Improve message relevance to increase engagement');
        END IF;
    END IF;
    
    -- Calculate content risk (0-100)
    IF v_frequency_data IS NOT NULL THEN
        v_content_risk := LEAST(100,
            (v_frequency_data.duplicate_content_count * 15) +
            (v_frequency_data.spam_keyword_count * 25)
        );
        
        IF v_frequency_data.duplicate_content_count > 3 THEN
            v_recommendations := array_append(v_recommendations, 'Diversify message content');
        END IF;
    END IF;
    
    -- Add spam history impact
    v_content_risk := LEAST(100, v_content_risk + (v_spam_history_count * 10));
    
    -- Calculate overall score
    v_overall_score := (v_frequency_risk + v_engagement_risk + v_content_risk) / 3;
    
    -- Determine risk level
    v_risk_level := CASE 
        WHEN v_overall_score >= 80 THEN 'critical'::spam_risk_level
        WHEN v_overall_score >= 60 THEN 'high'::spam_risk_level
        WHEN v_overall_score >= 30 THEN 'medium'::spam_risk_level
        ELSE 'low'::spam_risk_level
    END;
    
    RETURN QUERY SELECT 
        v_risk_level,
        v_frequency_risk,
        v_engagement_risk,
        v_content_risk,
        v_overall_score,
        v_recommendations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-update frequency counters trigger
CREATE OR REPLACE FUNCTION trigger_update_message_frequency()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM update_message_frequency(
            NEW.tenant_id, 
            NEW.phone_number, 
            NEW.role = 'assistant'
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on conversation_history for automatic frequency tracking
DROP TRIGGER IF EXISTS trigger_conversation_frequency_tracking ON conversation_history;
CREATE TRIGGER trigger_conversation_frequency_tracking
    AFTER INSERT ON conversation_history
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_message_frequency();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON whatsapp_spam_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON whatsapp_message_frequency TO authenticated;
GRANT SELECT, INSERT, UPDATE ON whatsapp_content_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION update_message_frequency(UUID, VARCHAR, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION track_content_usage(UUID, VARCHAR, TEXT, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_spam_risk_assessment(UUID, VARCHAR) TO authenticated;

-- Insert spam prevention settings
INSERT INTO app_settings (key, value, description, created_at) 
VALUES 
    ('spam_max_messages_per_hour', '10', 'Maximum messages per hour per recipient', now()),
    ('spam_max_messages_per_day', '50', 'Maximum messages per day per recipient', now()),
    ('spam_max_messages_per_week', '200', 'Maximum messages per week per recipient', now()),
    ('spam_duplicate_threshold', '3', 'Threshold for duplicate content detection', now()),
    ('spam_response_rate_threshold', '0.10', 'Minimum response rate threshold', now()),
    ('spam_rapid_fire_threshold', '5', 'Rapid fire messaging threshold', now()),
    ('spam_rapid_fire_window_seconds', '30', 'Rapid fire detection window in seconds', now())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = now();

-- Create spam prevention summary view
CREATE OR REPLACE VIEW whatsapp_spam_prevention_summary AS
SELECT 
    t.business_name,
    t.business_domain,
    COUNT(DISTINCT wsa.phone_number) as phones_with_spam_attempts,
    COUNT(wsa.*) as total_spam_attempts,
    COUNT(wsa.*) FILTER (WHERE wsa.was_blocked = true) as blocked_attempts,
    COUNT(wsa.*) FILTER (WHERE wsa.risk_level = 'high') as high_risk_attempts,
    COUNT(wsa.*) FILTER (WHERE wsa.risk_level = 'critical') as critical_risk_attempts,
    AVG(wmf.response_rate) FILTER (WHERE wmf.total_sent > 0) as avg_response_rate,
    COUNT(wmf.*) FILTER (WHERE wmf.response_rate < 0.10 AND wmf.total_sent > 10) as low_engagement_recipients,
    MAX(wsa.created_at) as last_spam_attempt,
    COUNT(DISTINCT wca.content_hash) as unique_content_pieces,
    MAX(wca.usage_count) as max_content_reuse
FROM tenants t
LEFT JOIN whatsapp_spam_attempts wsa ON t.id = wsa.tenant_id
LEFT JOIN whatsapp_message_frequency wmf ON t.id = wmf.tenant_id
LEFT JOIN whatsapp_content_analysis wca ON t.id = wca.tenant_id
GROUP BY t.id, t.business_name, t.business_domain;

COMMENT ON TABLE whatsapp_spam_attempts IS 'Tracks spam attempts and prevention analysis for WhatsApp messages';
COMMENT ON TABLE whatsapp_message_frequency IS 'Tracks message frequency patterns for spam prevention';
COMMENT ON TABLE whatsapp_content_analysis IS 'Analyzes content patterns for duplicate and spam detection';
COMMENT ON FUNCTION update_message_frequency(UUID, VARCHAR, BOOLEAN) IS 'Updates message frequency counters for spam prevention';
COMMENT ON FUNCTION get_spam_risk_assessment(UUID, VARCHAR) IS 'Provides comprehensive spam risk assessment for a recipient';