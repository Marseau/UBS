-- =====================================================
-- Universal Booking System - Complete Database Schema
-- =====================================================
-- This migration creates the complete multi-tenant database schema
-- Run this before applying RLS policies (01-rls-policies.sql)

-- Enable necessary extensions
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types and enums
-- =====================================================

-- Business domain enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_domain') THEN
        CREATE TYPE business_domain AS ENUM (
            'legal',
            'healthcare', 
            'education',
            'beauty',
            'sports',
            'consulting',
            'other'
        );
    END IF;
END $$;

-- Appointment status enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
        CREATE TYPE appointment_status AS ENUM (
            'pending',
            'confirmed',
            'in_progress',
            'completed',
            'cancelled',
            'no_show',
            'rescheduled'
        );
    END IF;
END $$;

-- Duration type enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duration_type') THEN
        CREATE TYPE duration_type AS ENUM (
            'fixed',
            'variable',
            'estimated',
            'session'
        );
    END IF;
END $$;

-- Price model enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'price_model') THEN
        CREATE TYPE price_model AS ENUM (
            'fixed',
            'hourly',
            'package',
            'dynamic',
            'consultation'
        );
    END IF;
END $$;

-- Core Tables
-- =====================================================

-- TENANTS table (central entity for multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    business_description TEXT,
    domain business_domain NOT NULL,
    email CITEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    whatsapp_phone TEXT,
    business_address JSONB,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    subscription_plan TEXT DEFAULT 'free',
    ai_settings JSONB NOT NULL DEFAULT '{
        "greeting_message": "Olá! Como posso ajudá-lo hoje?",
        "domain_keywords": [],
        "escalation_triggers": [],
        "sensitive_topics": [],
        "upsell_enabled": false,
        "motivational_messages": false
    }'::JSONB,
    domain_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    business_rules JSONB NOT NULL DEFAULT '{
        "working_hours": {
            "monday": [],
            "tuesday": [],
            "wednesday": [],
            "thursday": [],
            "friday": [],
            "saturday": [],
            "sunday": []
        },
        "advance_booking_days": 30,
        "cancellation_policy": "24 hours notice required",
        "payment_methods": ["cash", "card"],
        "travel_time_minutes": 0,
        "package_discounts": false,
        "peak_hours_surcharge": 0,
        "loyalty_program": false
    }'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS table (cross-tenant users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    email CITEXT,
    preferences JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER_TENANTS junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS user_tenants (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'customer',
    tenant_preferences JSONB DEFAULT '{}'::JSONB,
    first_interaction TIMESTAMPTZ DEFAULT NOW(),
    last_interaction TIMESTAMPTZ DEFAULT NOW(),
    total_bookings INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, tenant_id)
);

-- SERVICE_CATEGORIES table
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- SERVICES table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    duration_type duration_type DEFAULT 'fixed',
    duration_minutes INTEGER,
    duration_min INTEGER,
    duration_max INTEGER,
    price_model price_model DEFAULT 'fixed',
    base_price DECIMAL(10,2),
    currency TEXT DEFAULT 'BRL',
    service_config JSONB DEFAULT '{}'::JSONB,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    advance_booking_days INTEGER,
    max_bookings_per_day INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROFESSIONALS table (service providers)
CREATE TABLE IF NOT EXISTS professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email CITEXT,
    phone TEXT,
    specialties TEXT[],
    bio TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB DEFAULT '{
        "monday": [],
        "tuesday": [],
        "wednesday": [],
        "thursday": [],
        "friday": [],
        "saturday": [],
        "sunday": []
    }'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AVAILABILITY_TEMPLATES table
CREATE TABLE IF NOT EXISTS availability_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    monday_slots JSONB DEFAULT '[]'::JSONB,
    tuesday_slots JSONB DEFAULT '[]'::JSONB,
    wednesday_slots JSONB DEFAULT '[]'::JSONB,
    thursday_slots JSONB DEFAULT '[]'::JSONB,
    friday_slots JSONB DEFAULT '[]'::JSONB,
    saturday_slots JSONB DEFAULT '[]'::JSONB,
    sunday_slots JSONB DEFAULT '[]'::JSONB,
    special_dates JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- APPOINTMENTS table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    status appointment_status DEFAULT 'pending',
    quoted_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    currency TEXT DEFAULT 'BRL',
    appointment_data JSONB DEFAULT '{}'::JSONB,
    customer_notes TEXT,
    internal_notes TEXT,
    external_event_id TEXT, -- Google Calendar event ID
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATION_HISTORY table
CREATE TABLE IF NOT EXISTS conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_from_user BOOLEAN NOT NULL,
    message_type TEXT DEFAULT 'text',
    intent_detected TEXT,
    confidence_score DECIMAL(5,4),
    conversation_context JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATION_STATES table
CREATE TABLE IF NOT EXISTS conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_state TEXT DEFAULT 'idle',
    context JSONB DEFAULT '{}'::JSONB,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- WHATSAPP_MEDIA table
CREATE TABLE IF NOT EXISTS whatsapp_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    whatsapp_id TEXT UNIQUE NOT NULL,
    media_type TEXT NOT NULL,
    filename TEXT,
    file_size INTEGER,
    mime_type TEXT,
    url TEXT,
    processed_url TEXT,
    processing_status TEXT DEFAULT 'pending',
    processing_result JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RULES table (business automation rules)
CREATE TABLE IF NOT EXISTS rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]'::JSONB,
    actions JSONB NOT NULL DEFAULT '[]'::JSONB,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    execution_count INTEGER DEFAULT 0,
    last_executed TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin and System Tables
-- =====================================================

-- ADMIN_USERS table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'tenant_admin' CHECK (role IN ('super_admin', 'tenant_admin', 'support')),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for super_admin
    permissions TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EMAIL_LOGS table
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email_type TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    error_message TEXT,
    email_data JSONB DEFAULT '{}'::JSONB
);

-- FUNCTION_EXECUTIONS table (AI function call monitoring)
CREATE TABLE IF NOT EXISTS function_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    function_name TEXT NOT NULL,
    parameters JSONB,
    result JSONB,
    execution_time_ms INTEGER,
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CALENDAR_SYNC_TOKENS table (Google Calendar integration)
CREATE TABLE IF NOT EXISTS calendar_sync_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    sync_token TEXT,
    last_sync TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, calendar_id)
);

-- STRIPE_CUSTOMERS table (payment integration)
CREATE TABLE IF NOT EXISTS stripe_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE NOT NULL,
    subscription_id TEXT,
    subscription_status TEXT,
    subscription_data JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- SYSTEM_HEALTH_LOGS table
CREATE TABLE IF NOT EXISTS system_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    component TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'error')),
    message TEXT,
    metrics JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_user ON user_tenants(tenant_id, user_id);

-- Service and appointment indexes
CREATE INDEX IF NOT EXISTS idx_services_tenant_active ON services(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_time ON appointments(tenant_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_user_tenant ON appointments(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Conversation indexes
CREATE INDEX IF NOT EXISTS idx_conversation_history_tenant_user ON conversation_history(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_created ON conversation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_states_tenant_user ON conversation_states(tenant_id, user_id);

-- WhatsApp and media indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_media_tenant ON whatsapp_media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_media_whatsapp_id ON whatsapp_media(whatsapp_id);

-- Admin and system indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_tenant ON admin_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON email_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_function_executions_tenant ON function_executions(tenant_id);

-- Create triggers for updated_at timestamps
-- =====================================================

-- Generic function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at 
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_professionals_updated_at 
    BEFORE UPDATE ON professionals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at 
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_templates_updated_at 
    BEFORE UPDATE ON availability_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_states_updated_at 
    BEFORE UPDATE ON conversation_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rules_updated_at 
    BEFORE UPDATE ON rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at 
    BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_sync_tokens_updated_at 
    BEFORE UPDATE ON calendar_sync_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_customers_updated_at 
    BEFORE UPDATE ON stripe_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create helper functions
-- =====================================================

-- Function to create a new tenant with default data
CREATE OR REPLACE FUNCTION create_tenant_with_defaults(
    p_name TEXT,
    p_slug TEXT,
    p_business_name TEXT,
    p_domain business_domain,
    p_email TEXT,
    p_phone TEXT,
    p_business_description TEXT DEFAULT NULL,
    p_whatsapp_phone TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_tenant_id UUID;
    default_category_id UUID;
BEGIN
    -- Insert tenant
    INSERT INTO tenants (
        name, slug, business_name, business_description, domain, 
        email, phone, whatsapp_phone
    ) VALUES (
        p_name, p_slug, p_business_name, p_business_description, p_domain,
        p_email, p_phone, p_whatsapp_phone
    ) RETURNING id INTO new_tenant_id;
    
    -- Create default service category
    INSERT INTO service_categories (tenant_id, name, description, display_order)
    VALUES (new_tenant_id, 'Serviços Gerais', 'Categoria padrão para serviços', 0)
    RETURNING id INTO default_category_id;
    
    -- Create default availability template
    INSERT INTO availability_templates (
        tenant_id, name, is_default,
        monday_slots, tuesday_slots, wednesday_slots, thursday_slots, friday_slots
    ) VALUES (
        new_tenant_id, 'Horário Padrão', true,
        '[{"start": "09:00", "end": "18:00"}]'::JSONB,
        '[{"start": "09:00", "end": "18:00"}]'::JSONB,
        '[{"start": "09:00", "end": "18:00"}]'::JSONB,
        '[{"start": "09:00", "end": "18:00"}]'::JSONB,
        '[{"start": "09:00", "end": "18:00"}]'::JSONB
    );
    
    RETURN new_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get tenant statistics
CREATE OR REPLACE FUNCTION get_tenant_stats(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM user_tenants WHERE tenant_id = p_tenant_id),
        'total_appointments', (SELECT COUNT(*) FROM appointments WHERE tenant_id = p_tenant_id),
        'total_services', (SELECT COUNT(*) FROM services WHERE tenant_id = p_tenant_id AND is_active = true),
        'appointments_this_month', (
            SELECT COUNT(*) FROM appointments 
            WHERE tenant_id = p_tenant_id 
            AND start_time >= date_trunc('month', NOW())
        ),
        'revenue_this_month', (
            SELECT COALESCE(SUM(final_price), 0) FROM appointments 
            WHERE tenant_id = p_tenant_id 
            AND status = 'completed'
            AND start_time >= date_trunc('month', NOW())
        )
    ) INTO stats;
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
-- =====================================================

COMMENT ON TABLE tenants IS 'Central entity for multi-tenant architecture. Each tenant represents a business.';
COMMENT ON TABLE users IS 'Cross-tenant users identified by phone number. Can interact with multiple tenants.';
COMMENT ON TABLE user_tenants IS 'Junction table managing many-to-many relationship between users and tenants.';
COMMENT ON TABLE services IS 'Services offered by each tenant with flexible pricing and duration models.';
COMMENT ON TABLE appointments IS 'Booking records with comprehensive status tracking and payment information.';
COMMENT ON TABLE conversation_history IS 'Complete WhatsApp conversation logs with AI context and intent detection.';
COMMENT ON TABLE professionals IS 'Service providers within each tenant with schedules and specialties.';
COMMENT ON TABLE rules IS 'Business automation rules for workflow management and customer interactions.';

COMMENT ON FUNCTION create_tenant_with_defaults(TEXT, TEXT, TEXT, business_domain, TEXT, TEXT, TEXT, TEXT) IS 'Creates a new tenant with default categories and availability templates';
COMMENT ON FUNCTION get_tenant_stats(UUID) IS 'Returns comprehensive statistics for a specific tenant';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Universal Booking System database schema successfully created';
    RAISE NOTICE 'All tables, indexes, triggers, and helper functions are now available';
    RAISE NOTICE 'Next step: Run 01-rls-policies.sql to enable Row Level Security';
END $$;