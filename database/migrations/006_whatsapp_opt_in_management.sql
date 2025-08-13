-- WhatsApp Opt-in Management System
-- Creates tables and policies for managing user consent and opt-in status
-- Required for Meta compliance

-- Create enum for opt-in sources
CREATE TYPE opt_in_source AS ENUM (
    'whatsapp_business_button',
    'website_form',
    'qr_code',
    'phone_call',
    'in_person',
    'third_party_api',
    'template_message_reply',
    'business_initiated'
);

-- Create enum for opt-in status
CREATE TYPE opt_in_status AS ENUM (
    'opted_in',
    'opted_out',
    'pending',
    'expired'
);

-- Create WhatsApp opt-in management table
CREATE TABLE IF NOT EXISTS whatsapp_opt_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Opt-in details
    opt_in_status opt_in_status NOT NULL DEFAULT 'pending',
    opt_in_source opt_in_source NOT NULL,
    opt_in_timestamp TIMESTAMPTZ,
    opt_out_timestamp TIMESTAMPTZ,
    
    -- Consent tracking
    consent_text TEXT, -- The exact opt-in message/consent given
    consent_language VARCHAR(5) DEFAULT 'pt_BR',
    consent_ip_address INET,
    consent_user_agent TEXT,
    
    -- Double opt-in (recommended for compliance)
    requires_double_opt_in BOOLEAN DEFAULT true,
    double_opt_in_sent_at TIMESTAMPTZ,
    double_opt_in_confirmed_at TIMESTAMPTZ,
    
    -- Marketing consent (separate from service messages)
    marketing_consent BOOLEAN DEFAULT false,
    marketing_consent_timestamp TIMESTAMPTZ,
    
    -- Expiry and renewal
    opt_in_expires_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ,
    
    -- Business category specific consent
    business_category VARCHAR(50),
    specific_services TEXT[], -- Array of specific services user opted in for
    
    -- Metadata
    source_metadata JSONB DEFAULT '{}',
    compliance_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    
    -- Constraints
    CONSTRAINT unique_tenant_phone UNIQUE (tenant_id, phone_number),
    CONSTRAINT valid_opt_in_flow CHECK (
        (opt_in_status = 'opted_in' AND opt_in_timestamp IS NOT NULL) OR
        (opt_in_status != 'opted_in')
    ),
    CONSTRAINT valid_double_opt_in CHECK (
        (requires_double_opt_in = false) OR
        (requires_double_opt_in = true AND double_opt_in_sent_at IS NOT NULL)
    ),
    CONSTRAINT valid_opt_out CHECK (
        (opt_in_status = 'opted_out' AND opt_out_timestamp IS NOT NULL) OR
        (opt_in_status != 'opted_out')
    )
);

-- Create indexes for performance
CREATE INDEX idx_whatsapp_opt_ins_tenant_id ON whatsapp_opt_ins(tenant_id);
CREATE INDEX idx_whatsapp_opt_ins_phone_number ON whatsapp_opt_ins(phone_number);
CREATE INDEX idx_whatsapp_opt_ins_status ON whatsapp_opt_ins(opt_in_status);
CREATE INDEX idx_whatsapp_opt_ins_last_interaction ON whatsapp_opt_ins(last_interaction_at);
CREATE INDEX idx_whatsapp_opt_ins_expires ON whatsapp_opt_ins(opt_in_expires_at);

-- Create opt-in history table for audit trail
CREATE TABLE IF NOT EXISTS whatsapp_opt_in_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opt_in_id UUID NOT NULL REFERENCES whatsapp_opt_ins(id) ON DELETE CASCADE,
    
    -- Change details
    action VARCHAR(50) NOT NULL, -- 'opt_in', 'opt_out', 'consent_update', 'status_change'
    previous_status opt_in_status,
    new_status opt_in_status,
    
    -- Change context
    change_reason TEXT,
    changed_by_user BOOLEAN DEFAULT false, -- true if user initiated, false if system/admin
    ip_address INET,
    user_agent TEXT,
    
    -- Metadata
    change_metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    
    CONSTRAINT valid_status_change CHECK (
        (previous_status IS NULL) OR (previous_status != new_status)
    )
);

-- Create index for history queries
CREATE INDEX idx_whatsapp_opt_in_history_opt_in_id ON whatsapp_opt_in_history(opt_in_id);
CREATE INDEX idx_whatsapp_opt_in_history_created_at ON whatsapp_opt_in_history(created_at);

-- Create RLS policies
ALTER TABLE whatsapp_opt_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_opt_in_history ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for opt-ins
CREATE POLICY tenant_isolation_whatsapp_opt_ins ON whatsapp_opt_ins
    FOR ALL
    USING (
        tenant_id = (
            SELECT value::uuid 
            FROM app_settings 
            WHERE key = 'current_tenant_id'
        )
    );

-- Tenant isolation for opt-in history
CREATE POLICY tenant_isolation_whatsapp_opt_in_history ON whatsapp_opt_in_history
    FOR ALL
    USING (
        opt_in_id IN (
            SELECT id FROM whatsapp_opt_ins 
            WHERE tenant_id = (
                SELECT value::uuid 
                FROM app_settings 
                WHERE key = 'current_tenant_id'
            )
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_opt_ins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_whatsapp_opt_ins_updated_at ON whatsapp_opt_ins;
CREATE TRIGGER trigger_update_whatsapp_opt_ins_updated_at
    BEFORE UPDATE ON whatsapp_opt_ins
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_opt_ins_updated_at();

-- Function to create opt-in history entries
CREATE OR REPLACE FUNCTION log_whatsapp_opt_in_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log changes to history table
    IF TG_OP = 'INSERT' THEN
        INSERT INTO whatsapp_opt_in_history (
            opt_in_id,
            action,
            previous_status,
            new_status,
            change_reason,
            created_by
        ) VALUES (
            NEW.id,
            'opt_in_created',
            NULL,
            NEW.opt_in_status,
            'Initial opt-in record created',
            NEW.created_by
        );
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        -- Log status changes
        IF OLD.opt_in_status != NEW.opt_in_status THEN
            INSERT INTO whatsapp_opt_in_history (
                opt_in_id,
                action,
                previous_status,
                new_status,
                change_reason,
                created_by
            ) VALUES (
                NEW.id,
                CASE 
                    WHEN NEW.opt_in_status = 'opted_in' THEN 'opt_in'
                    WHEN NEW.opt_in_status = 'opted_out' THEN 'opt_out'
                    ELSE 'status_change'
                END,
                OLD.opt_in_status,
                NEW.opt_in_status,
                'Status updated',
                NEW.updated_by
            );
        END IF;
        
        -- Log marketing consent changes
        IF OLD.marketing_consent != NEW.marketing_consent THEN
            INSERT INTO whatsapp_opt_in_history (
                opt_in_id,
                action,
                previous_status,
                new_status,
                change_reason,
                created_by
            ) VALUES (
                NEW.id,
                'consent_update',
                OLD.opt_in_status,
                NEW.opt_in_status,
                CASE 
                    WHEN NEW.marketing_consent THEN 'Marketing consent granted'
                    ELSE 'Marketing consent revoked'
                END,
                NEW.updated_by
            );
        END IF;
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for history logging
DROP TRIGGER IF EXISTS trigger_log_whatsapp_opt_in_changes ON whatsapp_opt_ins;
CREATE TRIGGER trigger_log_whatsapp_opt_in_changes
    AFTER INSERT OR UPDATE ON whatsapp_opt_ins
    FOR EACH ROW
    EXECUTE FUNCTION log_whatsapp_opt_in_changes();

-- Function to automatically expire old opt-ins
CREATE OR REPLACE FUNCTION expire_old_whatsapp_opt_ins()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER := 0;
BEGIN
    -- Expire opt-ins that haven't had interaction in 1 year (Meta recommendation)
    UPDATE whatsapp_opt_ins 
    SET 
        opt_in_status = 'expired',
        updated_at = now(),
        updated_by = NULL
    WHERE 
        opt_in_status = 'opted_in' 
        AND (
            last_interaction_at < (now() - INTERVAL '1 year') OR
            (opt_in_expires_at IS NOT NULL AND opt_in_expires_at < now())
        );
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user opt-in status (used by application)
CREATE OR REPLACE FUNCTION get_whatsapp_opt_in_status(
    p_tenant_id UUID,
    p_phone_number VARCHAR(20)
) RETURNS TABLE (
    is_opted_in BOOLEAN,
    opt_in_status opt_in_status,
    marketing_consent BOOLEAN,
    last_interaction TIMESTAMPTZ,
    requires_double_opt_in BOOLEAN,
    double_opt_in_confirmed BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN wo.opt_in_status = 'opted_in' AND 
                 (wo.opt_in_expires_at IS NULL OR wo.opt_in_expires_at > now()) AND
                 (wo.requires_double_opt_in = false OR wo.double_opt_in_confirmed_at IS NOT NULL)
            THEN true 
            ELSE false 
        END as is_opted_in,
        COALESCE(wo.opt_in_status, 'pending'::opt_in_status) as opt_in_status,
        COALESCE(wo.marketing_consent, false) as marketing_consent,
        wo.last_interaction_at,
        COALESCE(wo.requires_double_opt_in, true) as requires_double_opt_in,
        (wo.double_opt_in_confirmed_at IS NOT NULL) as double_opt_in_confirmed
    FROM whatsapp_opt_ins wo
    WHERE wo.tenant_id = p_tenant_id 
      AND wo.phone_number = p_phone_number
    
    UNION ALL
    
    -- Return default values if no record exists
    SELECT 
        false as is_opted_in,
        'pending'::opt_in_status as opt_in_status,
        false as marketing_consent,
        NULL::TIMESTAMPTZ as last_interaction,
        true as requires_double_opt_in,
        false as double_opt_in_confirmed
    WHERE NOT EXISTS (
        SELECT 1 FROM whatsapp_opt_ins 
        WHERE tenant_id = p_tenant_id AND phone_number = p_phone_number
    )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record user interaction (resets expiry timer)
CREATE OR REPLACE FUNCTION record_whatsapp_interaction(
    p_tenant_id UUID,
    p_phone_number VARCHAR(20),
    p_interaction_type VARCHAR(50) DEFAULT 'message'
) RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE whatsapp_opt_ins 
    SET 
        last_interaction_at = now(),
        updated_at = now()
    WHERE 
        tenant_id = p_tenant_id 
        AND phone_number = p_phone_number
        AND opt_in_status = 'opted_in';
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for compliance reporting
CREATE OR REPLACE VIEW whatsapp_opt_in_compliance_report AS
SELECT 
    t.business_name,
    t.business_domain,
    COUNT(*) as total_opt_ins,
    COUNT(*) FILTER (WHERE wo.opt_in_status = 'opted_in') as active_opt_ins,
    COUNT(*) FILTER (WHERE wo.opt_in_status = 'opted_out') as opted_out,
    COUNT(*) FILTER (WHERE wo.opt_in_status = 'pending') as pending_opt_ins,
    COUNT(*) FILTER (WHERE wo.opt_in_status = 'expired') as expired_opt_ins,
    COUNT(*) FILTER (WHERE wo.marketing_consent = true) as marketing_consents,
    COUNT(*) FILTER (WHERE wo.requires_double_opt_in = true AND wo.double_opt_in_confirmed_at IS NULL) as pending_double_opt_in,
    AVG(EXTRACT(EPOCH FROM (now() - wo.last_interaction_at))/86400) FILTER (WHERE wo.last_interaction_at IS NOT NULL) as avg_days_since_interaction,
    MIN(wo.created_at) as first_opt_in,
    MAX(wo.created_at) as latest_opt_in
FROM tenants t
LEFT JOIN whatsapp_opt_ins wo ON t.id = wo.tenant_id
GROUP BY t.id, t.business_name, t.business_domain;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON whatsapp_opt_ins TO authenticated;
GRANT SELECT ON whatsapp_opt_in_history TO authenticated;
GRANT SELECT ON whatsapp_opt_in_compliance_report TO authenticated;
GRANT EXECUTE ON FUNCTION get_whatsapp_opt_in_status(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION record_whatsapp_interaction(UUID, VARCHAR, VARCHAR) TO authenticated;

-- Insert default system settings for opt-in management
INSERT INTO app_settings (key, value, description, created_at) 
VALUES 
    ('whatsapp_default_opt_in_expiry_days', '365', 'Default number of days before opt-in expires', now()),
    ('whatsapp_require_double_opt_in', 'true', 'Require double opt-in for new users', now()),
    ('whatsapp_auto_expire_inactive_days', '365', 'Auto-expire opt-ins after this many days of inactivity', now())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = now();

-- Create indexes for the view
CREATE INDEX IF NOT EXISTS idx_whatsapp_opt_ins_compliance_report ON whatsapp_opt_ins(tenant_id, opt_in_status, marketing_consent, created_at);

COMMENT ON TABLE whatsapp_opt_ins IS 'Manages WhatsApp user opt-in consent and compliance tracking';
COMMENT ON TABLE whatsapp_opt_in_history IS 'Audit trail for all opt-in status changes';
COMMENT ON FUNCTION get_whatsapp_opt_in_status(UUID, VARCHAR) IS 'Get current opt-in status for a phone number';
COMMENT ON FUNCTION record_whatsapp_interaction(UUID, VARCHAR, VARCHAR) IS 'Record user interaction to reset expiry timer';
COMMENT ON VIEW whatsapp_opt_in_compliance_report IS 'Compliance reporting view for WhatsApp opt-ins by tenant';