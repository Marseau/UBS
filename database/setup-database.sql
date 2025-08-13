-- =====================================================
-- Universal Booking System - Database Setup Script
-- =====================================================
-- Complete database setup for production deployment
-- This script combines schema creation, RLS policies, and initial data

-- Run migrations in order
\echo '========================================'
\echo 'Setting up Universal Booking System Database'
\echo '========================================'

-- 1. Create schema and tables
\echo 'Step 1: Creating database schema...'
\i 00-schema-migration.sql

-- 2. Apply RLS policies  
\echo 'Step 2: Applying Row Level Security policies...'
\i 01-rls-policies.sql

-- 3. Insert initial data
\echo 'Step 3: Inserting initial system data...'

-- Create initial super admin user
INSERT INTO admin_users (
    email,
    password_hash, 
    name,
    role,
    tenant_id,
    permissions
) VALUES (
    'admin@universalbooking.com',
    '$2b$10$rQFQj9HBKWQYbZYqQeqZRuEWbYpRsLZGcQ7P0XHYqH5QJ3YKXNYHy', -- admin123
    'System Administrator',
    'super_admin',
    NULL,
    ARRAY['*']
) ON CONFLICT (email) DO NOTHING;

-- Create sample tenant for testing
DO $$
DECLARE
    sample_tenant_id UUID;
    sample_user_id UUID;
    category_id UUID;
BEGIN
    -- Create sample tenant
    SELECT create_tenant_with_defaults(
        'Clínica Exemplo',
        'clinica-exemplo',
        'Clínica Médica Exemplo',
        'healthcare',
        'contato@clinicaexemplo.com',
        '+5511999999999',
        'Clínica médica especializada em consultas gerais e especialidades',
        '+5511999999999'
    ) INTO sample_tenant_id;
    
    -- Create sample user
    INSERT INTO users (phone, name, email)
    VALUES ('+5511888888888', 'João Silva', 'joao@exemplo.com')
    RETURNING id INTO sample_user_id;
    
    -- Link user to tenant
    INSERT INTO user_tenants (user_id, tenant_id, role)
    VALUES (sample_user_id, sample_tenant_id, 'customer');
    
    -- Get default category
    SELECT id INTO category_id
    FROM service_categories 
    WHERE tenant_id = sample_tenant_id 
    LIMIT 1;
    
    -- Create sample services
    INSERT INTO services (
        tenant_id, category_id, name, description, 
        duration_minutes, base_price, currency
    ) VALUES 
    (sample_tenant_id, category_id, 'Consulta Geral', 'Consulta médica geral', 30, 150.00, 'BRL'),
    (sample_tenant_id, category_id, 'Consulta Especializada', 'Consulta com especialista', 45, 250.00, 'BRL');
    
    RAISE NOTICE 'Sample tenant created with ID: %', sample_tenant_id;
    RAISE NOTICE 'Sample user created with ID: %', sample_user_id;
END $$;

-- Create additional system functions
\echo 'Step 4: Creating system utility functions...'

-- Function to safely delete tenant and all related data
CREATE OR REPLACE FUNCTION delete_tenant_cascade(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Delete in order to respect foreign key constraints
    DELETE FROM function_executions WHERE tenant_id = p_tenant_id;
    DELETE FROM email_logs WHERE tenant_id = p_tenant_id;
    DELETE FROM system_health_logs WHERE tenant_id = p_tenant_id;
    DELETE FROM calendar_sync_tokens WHERE tenant_id = p_tenant_id;
    DELETE FROM stripe_customers WHERE tenant_id = p_tenant_id;
    DELETE FROM whatsapp_media WHERE tenant_id = p_tenant_id;
    DELETE FROM conversation_states WHERE tenant_id = p_tenant_id;
    DELETE FROM conversation_history WHERE tenant_id = p_tenant_id;
    DELETE FROM appointments WHERE tenant_id = p_tenant_id;
    DELETE FROM rules WHERE tenant_id = p_tenant_id;
    DELETE FROM availability_templates WHERE tenant_id = p_tenant_id;
    DELETE FROM services WHERE tenant_id = p_tenant_id;
    DELETE FROM service_categories WHERE tenant_id = p_tenant_id;
    DELETE FROM professionals WHERE tenant_id = p_tenant_id;
    DELETE FROM user_tenants WHERE tenant_id = p_tenant_id;
    DELETE FROM admin_users WHERE tenant_id = p_tenant_id;
    DELETE FROM tenants WHERE id = p_tenant_id;
    
    RAISE NOTICE 'Tenant % and all related data deleted successfully', p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to backup tenant data
CREATE OR REPLACE FUNCTION backup_tenant_data(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
    backup_data JSONB;
BEGIN
    SELECT jsonb_build_object(
        'tenant', (SELECT row_to_json(t.*) FROM tenants t WHERE id = p_tenant_id),
        'services', (SELECT jsonb_agg(row_to_json(s.*)) FROM services s WHERE tenant_id = p_tenant_id),
        'service_categories', (SELECT jsonb_agg(row_to_json(sc.*)) FROM service_categories sc WHERE tenant_id = p_tenant_id),
        'professionals', (SELECT jsonb_agg(row_to_json(p.*)) FROM professionals p WHERE tenant_id = p_tenant_id),
        'appointments', (SELECT jsonb_agg(row_to_json(a.*)) FROM appointments a WHERE tenant_id = p_tenant_id),
        'user_tenants', (SELECT jsonb_agg(row_to_json(ut.*)) FROM user_tenants ut WHERE tenant_id = p_tenant_id),
        'conversation_history_count', (SELECT COUNT(*) FROM conversation_history WHERE tenant_id = p_tenant_id),
        'rules', (SELECT jsonb_agg(row_to_json(r.*)) FROM rules r WHERE tenant_id = p_tenant_id),
        'availability_templates', (SELECT jsonb_agg(row_to_json(at.*)) FROM availability_templates at WHERE tenant_id = p_tenant_id),
        'backup_timestamp', NOW()
    ) INTO backup_data;
    
    RETURN backup_data;
END;
$$ LANGUAGE plpgsql;

-- Function to validate tenant data integrity
CREATE OR REPLACE FUNCTION validate_tenant_integrity(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
    validation_result JSONB;
    errors TEXT[] := '{}';
    warnings TEXT[] := '{}';
BEGIN
    -- Check if tenant exists and is active
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN
        errors := array_append(errors, 'Tenant does not exist or is not active');
    END IF;
    
    -- Check for services without categories
    IF EXISTS (SELECT 1 FROM services WHERE tenant_id = p_tenant_id AND category_id IS NULL) THEN
        warnings := array_append(warnings, 'Some services have no category assigned');
    END IF;
    
    -- Check for appointments without services
    IF EXISTS (SELECT 1 FROM appointments WHERE tenant_id = p_tenant_id AND service_id IS NULL) THEN
        warnings := array_append(warnings, 'Some appointments have no service assigned');
    END IF;
    
    -- Check for users without any bookings
    IF EXISTS (
        SELECT 1 FROM user_tenants ut 
        WHERE ut.tenant_id = p_tenant_id 
        AND ut.total_bookings = 0 
        AND ut.first_interaction < NOW() - INTERVAL '30 days'
    ) THEN
        warnings := array_append(warnings, 'Some users have no bookings after 30+ days');
    END IF;
    
    -- Check for incomplete tenant configuration
    IF EXISTS (
        SELECT 1 FROM tenants 
        WHERE id = p_tenant_id 
        AND (business_description IS NULL OR whatsapp_phone IS NULL)
    ) THEN
        warnings := array_append(warnings, 'Tenant configuration is incomplete');
    END IF;
    
    SELECT jsonb_build_object(
        'tenant_id', p_tenant_id,
        'validation_timestamp', NOW(),
        'is_valid', array_length(errors, 1) = 0 OR array_length(errors, 1) IS NULL,
        'errors', errors,
        'warnings', warnings,
        'stats', get_tenant_stats(p_tenant_id)
    ) INTO validation_result;
    
    RETURN validation_result;
END;
$$ LANGUAGE plpgsql;

-- Create maintenance functions
\echo 'Step 5: Creating maintenance functions...'

-- Function to clean old conversation history (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM conversation_history 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update user booking counts
CREATE OR REPLACE FUNCTION refresh_user_booking_counts()
RETURNS VOID AS $$
BEGIN
    UPDATE user_tenants 
    SET total_bookings = (
        SELECT COUNT(*) 
        FROM appointments a 
        WHERE a.user_id = user_tenants.user_id 
        AND a.tenant_id = user_tenants.tenant_id
        AND a.status IN ('completed', 'confirmed')
    ),
    last_interaction = (
        SELECT MAX(created_at)
        FROM conversation_history ch
        WHERE ch.user_id = user_tenants.user_id
        AND ch.tenant_id = user_tenants.tenant_id
    );
END;
$$ LANGUAGE plpgsql;

-- Create indexes for system monitoring
\echo 'Step 6: Creating monitoring indexes...'

CREATE INDEX IF NOT EXISTS idx_function_executions_performance 
ON function_executions(tenant_id, created_at, execution_time_ms);

CREATE INDEX IF NOT EXISTS idx_email_logs_status 
ON email_logs(status, sent_at);

CREATE INDEX IF NOT EXISTS idx_system_health_component_status 
ON system_health_logs(component, status, created_at);

CREATE INDEX IF NOT EXISTS idx_appointments_revenue_analysis 
ON appointments(tenant_id, status, final_price, start_time) 
WHERE status = 'completed' AND final_price IS NOT NULL;

-- Set up basic monitoring views
\echo 'Step 7: Creating monitoring views...'

-- View for tenant performance metrics
CREATE OR REPLACE VIEW tenant_performance_summary AS
SELECT 
    t.id,
    t.slug,
    t.business_name,
    t.domain,
    t.status,
    (SELECT COUNT(*) FROM user_tenants ut WHERE ut.tenant_id = t.id) as total_users,
    (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = t.id) as total_appointments,
    (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = t.id AND a.start_time >= date_trunc('month', NOW())) as appointments_this_month,
    (SELECT COALESCE(SUM(a.final_price), 0) FROM appointments a WHERE a.tenant_id = t.id AND a.status = 'completed' AND a.start_time >= date_trunc('month', NOW())) as revenue_this_month,
    (SELECT COUNT(*) FROM services s WHERE s.tenant_id = t.id AND s.is_active = true) as active_services,
    t.created_at,
    t.updated_at
FROM tenants t
WHERE t.status = 'active';

-- View for system health overview
CREATE OR REPLACE VIEW system_health_overview AS
SELECT 
    component,
    status,
    COUNT(*) as occurrences,
    MAX(created_at) as last_occurrence,
    AVG(CASE WHEN metrics->>'response_time_ms' IS NOT NULL 
         THEN (metrics->>'response_time_ms')::INTEGER 
         ELSE NULL END) as avg_response_time_ms
FROM system_health_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY component, status
ORDER BY component, status;

-- Final setup verification
\echo 'Step 8: Verifying setup...'

DO $$
DECLARE
    table_count INTEGER;
    policy_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    -- Count RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'public';
    
    -- Count custom functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_type = 'FUNCTION'
    AND routine_name LIKE '%tenant%' OR routine_name LIKE '%booking%';
    
    RAISE NOTICE '======================================';
    RAISE NOTICE 'Database setup completed successfully!';
    RAISE NOTICE '======================================';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'RLS policies applied: %', policy_count;
    RAISE NOTICE 'Custom functions created: %', function_count;
    RAISE NOTICE '======================================';
    RAISE NOTICE 'Admin login: admin@universalbooking.com / admin123';
    RAISE NOTICE 'Sample tenant slug: clinica-exemplo';
    RAISE NOTICE '======================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Update your .env file with database credentials';
    RAISE NOTICE '2. Run application with: npm run dev';
    RAISE NOTICE '3. Test tenant context with set_tenant_context() function';
    RAISE NOTICE '======================================';
END $$;