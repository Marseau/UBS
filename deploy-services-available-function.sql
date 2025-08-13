-- DEPLOY: calculate_services_available() - Função padronizada
-- OBJETIVO: Lista de nomes de serviços disponíveis por tenant por período

-- Drop function if exists
DROP FUNCTION IF EXISTS calculate_services_available(UUID, DATE, DATE);

-- Create function following system standards
CREATE OR REPLACE FUNCTION calculate_services_available(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  
SET search_path = public
AS $$
DECLARE
    total_count INTEGER := 0;
    services_names TEXT[];
    result JSON;
BEGIN
    -- Standard input validation
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date cannot be NULL';
    END IF;
    
    IF p_start_date > p_end_date THEN
        RAISE EXCEPTION 'start_date must be before or equal to end_date';
    END IF;
    
    -- Verify tenant exists and is active
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN
        RAISE EXCEPTION 'Tenant does not exist or is not active: %', p_tenant_id;
    END IF;
    
    -- Get service names and count
    SELECT 
        COALESCE(array_agg(name ORDER BY name), ARRAY[]::TEXT[]),
        COUNT(*)::INTEGER
    INTO services_names, total_count
    FROM services 
    WHERE tenant_id = p_tenant_id 
    AND is_active = true
    AND created_at <= p_end_date::timestamp
    AND (updated_at IS NULL OR updated_at >= p_start_date::timestamp);
    
    -- Build result following system standard
    result = json_build_object(
        'services', services_names,
        'count', total_count
    );
    
    -- Return in standard format
    RETURN json_build_array(result);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating services available for tenant %: %', p_tenant_id, SQLERRM;
END;
$$;

-- Add comment
COMMENT ON FUNCTION calculate_services_available IS 'Returns list of service names available for tenant in specified period. Follows system standards.';