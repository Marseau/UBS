-- =====================================================
-- FIX: get_tenant_services_count_by_period Function
-- PROBLEMA: Lógica de data incorreta causa count = 0
-- SOLUÇÃO: Corrigir filtro temporal e adicionar logs
-- =====================================================

-- Drop existing function first
DROP FUNCTION IF EXISTS get_tenant_services_count_by_period(UUID, VARCHAR);

-- Recreate with corrected logic
CREATE OR REPLACE FUNCTION get_tenant_services_count_by_period(
    p_tenant_id UUID,
    p_period_type VARCHAR(10) DEFAULT '30d'
)
RETURNS INTEGER AS $$
DECLARE
    start_date DATE;
    end_date DATE := CURRENT_DATE;
    services_count INTEGER := 0;
    tenant_exists BOOLEAN := false;
    debug_info TEXT := '';
BEGIN
    -- STEP 1: Validate tenant exists
    SELECT EXISTS(SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') 
    INTO tenant_exists;
    
    IF NOT tenant_exists THEN
        RAISE WARNING 'TENANT_SERVICES_COUNT: Tenant % not found or inactive', p_tenant_id;
        RETURN 0;
    END IF;
    
    -- STEP 2: Calculate period dates
    CASE p_period_type
        WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
        WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
        WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
        ELSE start_date := end_date - INTERVAL '30 days'; -- Default to 30 days
    END CASE;
    
    debug_info := format('Period: %s, Start: %s, End: %s', p_period_type, start_date, end_date);
    RAISE NOTICE 'TENANT_SERVICES_COUNT: Tenant %, %', p_tenant_id, debug_info;
    
    -- STEP 3: Count ACTIVE services that existed during the period
    -- FIXED LOGIC: Service was active if:
    -- 1. Created before or during period (created_at <= end_date)
    -- 2. Still active OR was deactivated after period start (updated_at IS NULL OR updated_at > start_date)
    -- 3. is_active = true (current status)
    
    SELECT COUNT(*)::INTEGER INTO services_count
    FROM services s
    WHERE s.tenant_id = p_tenant_id
    AND s.is_active = true
    AND s.created_at <= end_date::timestamp
    AND (
        s.updated_at IS NULL -- Never updated (always active)
        OR s.updated_at >= start_date::timestamp -- Updated during or after period
    );
    
    -- STEP 4: Debug logging
    RAISE NOTICE 'TENANT_SERVICES_COUNT: Found % services for tenant %', services_count, p_tenant_id;
    
    -- STEP 5: Additional validation - check if any services exist at all
    IF services_count = 0 THEN
        DECLARE
            total_services INTEGER;
        BEGIN
            SELECT COUNT(*) INTO total_services 
            FROM services 
            WHERE tenant_id = p_tenant_id;
            
            RAISE NOTICE 'TENANT_SERVICES_COUNT: Total services for tenant %: % (active: %)', 
                p_tenant_id, total_services, services_count;
        END;
    END IF;
    
    RETURN COALESCE(services_count, 0);
    
EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging
        RAISE WARNING 'TENANT_SERVICES_COUNT ERROR for tenant %: % (SQLSTATE: %)', 
            p_tenant_id, SQLERRM, SQLSTATE;
        RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TEST: Validation function for debugging
-- =====================================================

CREATE OR REPLACE FUNCTION debug_tenant_services(p_tenant_id UUID)
RETURNS TABLE (
    period VARCHAR(10),
    services_count INTEGER,
    total_services INTEGER,
    active_services INTEGER,
    debug_info TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        '7d'::VARCHAR(10),
        get_tenant_services_count_by_period(p_tenant_id, '7d'),
        (SELECT COUNT(*)::INTEGER FROM services WHERE tenant_id = p_tenant_id),
        (SELECT COUNT(*)::INTEGER FROM services WHERE tenant_id = p_tenant_id AND is_active = true),
        format('Tenant: %s, Current date: %s', p_tenant_id, CURRENT_DATE)
    UNION ALL
    SELECT 
        '30d'::VARCHAR(10),
        get_tenant_services_count_by_period(p_tenant_id, '30d'),
        (SELECT COUNT(*)::INTEGER FROM services WHERE tenant_id = p_tenant_id),
        (SELECT COUNT(*)::INTEGER FROM services WHERE tenant_id = p_tenant_id AND is_active = true),
        format('Tenant: %s, Current date: %s', p_tenant_id, CURRENT_DATE)
    UNION ALL
    SELECT 
        '90d'::VARCHAR(10),
        get_tenant_services_count_by_period(p_tenant_id, '90d'),
        (SELECT COUNT(*)::INTEGER FROM services WHERE tenant_id = p_tenant_id),
        (SELECT COUNT(*)::INTEGER FROM services WHERE tenant_id = p_tenant_id AND is_active = true),
        format('Tenant: %s, Current date: %s', p_tenant_id, CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- =====================================================
COMMENT ON FUNCTION get_tenant_services_count_by_period IS 'FIXED: Returns count of services active during specified period for tenant. Handles NULL updated_at correctly.';
COMMENT ON FUNCTION debug_tenant_services IS 'DEBUG: Helper function to validate services count across different periods for troubleshooting.';