-- =====================================================
-- Universal Booking System - Row Level Security Policies
-- =====================================================
-- This file implements comprehensive RLS policies for multi-tenant data isolation
-- Run this after creating the base schema to enable tenant-level security

-- Enable RLS on all tenant-scoped tables
-- =====================================================

-- Core tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_media ENABLE ROW LEVEL SECURITY;

-- Additional tables that may exist
DO $$
BEGIN
    -- Enable RLS on tables that may exist (ignore errors if they don't)
    BEGIN
        ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE function_executions ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE calendar_sync_tokens ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        ALTER TABLE system_health_logs ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- Create helper functions for RLS policies
-- =====================================================

-- Function to get current tenant ID from session
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant', true)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is admin (bypasses tenant restrictions)
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.is_admin', true)::BOOLEAN, false);
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.is_super_admin', true)::BOOLEAN, false);
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for tenant-scoped tables
-- =====================================================

-- TENANTS table policies
DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL 
    USING (
        is_super_admin() OR 
        id = get_current_tenant_id()
    );

-- USERS table policies (cross-tenant users, but filtered by user_tenants)
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
    FOR ALL 
    USING (
        is_admin_user() OR
        EXISTS (
            SELECT 1 FROM user_tenants ut 
            WHERE ut.user_id = users.id 
            AND ut.tenant_id = get_current_tenant_id()
        )
    );

-- USER_TENANTS table policies
DROP POLICY IF EXISTS tenant_isolation_user_tenants ON user_tenants;
CREATE POLICY tenant_isolation_user_tenants ON user_tenants
    FOR ALL 
    USING (
        is_admin_user() OR 
        tenant_id = get_current_tenant_id()
    );

-- SERVICES table policies
DROP POLICY IF EXISTS tenant_isolation_services ON services;
CREATE POLICY tenant_isolation_services ON services
    FOR ALL 
    USING (
        is_admin_user() OR 
        tenant_id = get_current_tenant_id()
    );

-- SERVICE_CATEGORIES table policies
DROP POLICY IF EXISTS tenant_isolation_service_categories ON service_categories;
CREATE POLICY tenant_isolation_service_categories ON service_categories
    FOR ALL 
    USING (
        is_admin_user() OR 
        tenant_id = get_current_tenant_id()
    );

-- APPOINTMENTS table policies
DROP POLICY IF EXISTS tenant_isolation_appointments ON appointments;
CREATE POLICY tenant_isolation_appointments ON appointments
    FOR ALL 
    USING (
        is_admin_user() OR 
        tenant_id = get_current_tenant_id()
    );

-- AVAILABILITY_TEMPLATES table policies
DROP POLICY IF EXISTS tenant_isolation_availability_templates ON availability_templates;
CREATE POLICY tenant_isolation_availability_templates ON availability_templates
    FOR ALL 
    USING (
        is_admin_user() OR 
        tenant_id = get_current_tenant_id()
    );

-- CONVERSATION_HISTORY table policies
DROP POLICY IF EXISTS tenant_isolation_conversation_history ON conversation_history;
CREATE POLICY tenant_isolation_conversation_history ON conversation_history
    FOR ALL 
    USING (
        is_admin_user() OR 
        tenant_id = get_current_tenant_id()
    );

-- CONVERSATION_STATES table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_conversation_states ON conversation_states;
        CREATE POLICY tenant_isolation_conversation_states ON conversation_states
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- WHATSAPP_MEDIA table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_whatsapp_media ON whatsapp_media;
        CREATE POLICY tenant_isolation_whatsapp_media ON whatsapp_media
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- PROFESSIONALS table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_professionals ON professionals;
        CREATE POLICY tenant_isolation_professionals ON professionals
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- RULES table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_rules ON rules;
        CREATE POLICY tenant_isolation_rules ON rules
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- STRIPE_CUSTOMERS table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_stripe_customers ON stripe_customers;
        CREATE POLICY tenant_isolation_stripe_customers ON stripe_customers
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- EMAIL_LOGS table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_email_logs ON email_logs;
        CREATE POLICY tenant_isolation_email_logs ON email_logs
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- FUNCTION_EXECUTIONS table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_function_executions ON function_executions;
        CREATE POLICY tenant_isolation_function_executions ON function_executions
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- CALENDAR_SYNC_TOKENS table policies (if exists)
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS tenant_isolation_calendar_sync_tokens ON calendar_sync_tokens;
        CREATE POLICY tenant_isolation_calendar_sync_tokens ON calendar_sync_tokens
            FOR ALL 
            USING (
                is_admin_user() OR 
                tenant_id = get_current_tenant_id()
            );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- Create grants for service role
-- =====================================================

-- Grant necessary permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to service role (for admin operations)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Create utility functions for managing tenant context
-- =====================================================

-- Function to set tenant context for current session
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID, is_admin BOOLEAN DEFAULT false)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tenant_id::text, false);
    PERFORM set_config('app.is_admin', is_admin::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set super admin context
CREATE OR REPLACE FUNCTION set_super_admin_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.is_super_admin', 'true', false);
    PERFORM set_config('app.is_admin', 'true', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear tenant context
CREATE OR REPLACE FUNCTION clear_tenant_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', '', false);
    PERFORM set_config('app.is_admin', 'false', false);
    PERFORM set_config('app.is_super_admin', 'false', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance with RLS
-- =====================================================

-- Tenant-scoped indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_tenant_id ON service_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_tenant_id ON conversation_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_availability_templates_tenant_id ON availability_templates(tenant_id);

-- Conditional indexes for tables that may exist
DO $$
BEGIN
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_professionals_tenant_id ON professionals(tenant_id);
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_rules_tenant_id ON rules(tenant_id);
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
    
    BEGIN
        CREATE INDEX IF NOT EXISTS idx_stripe_customers_tenant_id ON stripe_customers(tenant_id);
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;
END $$;

-- Security and monitoring
-- =====================================================

-- Create audit log for RLS policy changes
CREATE TABLE IF NOT EXISTS rls_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    tenant_id UUID,
    user_role TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    details JSONB
);

-- Function to log RLS policy violations (for monitoring)
CREATE OR REPLACE FUNCTION log_rls_violation(
    table_name TEXT,
    action TEXT,
    attempted_tenant_id UUID DEFAULT NULL,
    details JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO rls_audit_log (action, table_name, tenant_id, user_role, details)
    VALUES (
        action,
        table_name,
        attempted_tenant_id,
        current_setting('app.user_role', true),
        details
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
-- =====================================================

COMMENT ON FUNCTION get_current_tenant_id() IS 'Returns the current tenant ID from session configuration';
COMMENT ON FUNCTION is_admin_user() IS 'Checks if current user has admin privileges to bypass tenant restrictions';
COMMENT ON FUNCTION is_super_admin() IS 'Checks if current user has super admin privileges';
COMMENT ON FUNCTION set_tenant_context(UUID, BOOLEAN) IS 'Sets tenant context for current session';
COMMENT ON FUNCTION set_super_admin_context() IS 'Sets super admin context for current session';
COMMENT ON FUNCTION clear_tenant_context() IS 'Clears all tenant context from current session';
COMMENT ON FUNCTION log_rls_violation(TEXT, TEXT, UUID, JSONB) IS 'Logs RLS policy violations for security monitoring';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Row Level Security policies successfully applied to Universal Booking System';
    RAISE NOTICE 'All tenant-scoped tables now have RLS enabled with proper isolation policies';
    RAISE NOTICE 'Use set_tenant_context(tenant_id) to set tenant context for queries';
    RAISE NOTICE 'Use set_super_admin_context() for admin operations across all tenants';
END $$;

-- New query to monitor wrong number attempts
SELECT attempted_phone, tenant_whatsapp_phone, COUNT(*) as attempts
FROM whatsapp_wrong_number_logs
WHERE received_at > NOW() - INTERVAL '30 days'
GROUP BY attempted_phone, tenant_whatsapp_phone
HAVING COUNT(*) > 3;