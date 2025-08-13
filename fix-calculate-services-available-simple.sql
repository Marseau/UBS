-- FIX: calculate_services_available() - Lista simples de serviços disponíveis
-- OBJETIVO: Retornar lista de nomes dos serviços disponíveis por tenant por período

DROP FUNCTION IF EXISTS calculate_services_available(UUID, DATE, DATE);

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
    -- Validar inputs
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be NULL';
    END IF;
    
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date cannot be NULL';
    END IF;
    
    -- Buscar nomes dos serviços que estavam ativos no período
    SELECT 
        COALESCE(array_agg(name ORDER BY name), ARRAY[]::TEXT[]),
        COUNT(*)
    INTO services_names, total_count
    FROM services 
    WHERE tenant_id = p_tenant_id 
    AND is_active = true
    AND created_at <= p_end_date::timestamp
    AND (updated_at IS NULL OR updated_at >= p_start_date::timestamp);
    
    -- Retornar no formato padrão
    result = json_build_object(
        'services', services_names,  -- Array de nomes: ["Corte", "Coloração", ...]
        'count', total_count
    );
    
    RETURN json_build_array(result);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error calculating services available for tenant %: %', p_tenant_id, SQLERRM;
END;
$$;

COMMENT ON FUNCTION calculate_services_available IS 'Returns list of service names available for tenant in specified period';