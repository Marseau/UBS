-- FIX: calculate_services_available() - Retornar nomes dos serviços
-- PROBLEMA: Função só retornava count, não os nomes dos serviços

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
    services_list JSON;
    result JSON;
BEGIN
    -- Contar serviços ativos no período
    SELECT COUNT(*) INTO total_count
    FROM services 
    WHERE tenant_id = p_tenant_id 
    AND is_active = true
    AND created_at <= p_end_date::timestamp
    AND (updated_at IS NULL OR updated_at >= p_start_date::timestamp);
    
    -- NOVO: Buscar nomes dos serviços ativos
    SELECT COALESCE(
        json_agg(
            json_build_object(
                'id', id,
                'name', name,
                'base_price', base_price,
                'is_active', is_active
            ) ORDER BY name
        ), 
        '[]'::json
    ) INTO services_list
    FROM services 
    WHERE tenant_id = p_tenant_id 
    AND is_active = true
    AND created_at <= p_end_date::timestamp
    AND (updated_at IS NULL OR updated_at >= p_start_date::timestamp);
    
    IF total_count IS NULL THEN
        total_count = 0;
    END IF;
    
    IF services_list IS NULL THEN
        services_list = '[]'::json;
    END IF;
    
    -- Retornar JSON com count E lista de serviços
    result = json_build_object(
        'services', services_list,  -- AGORA com nomes dos serviços!
        'count', total_count
    );
    
    RETURN json_build_array(result);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'calculate_services_available ERROR for tenant %: %', p_tenant_id, SQLERRM;
        RETURN json_build_array(
            json_build_object(
                'services', '[]'::json,
                'count', 0
            )
        );
END;
$$;

COMMENT ON FUNCTION calculate_services_available IS 'FIXED: Returns count AND names of services for tenant in specified period';