
        DROP FUNCTION IF EXISTS get_tenant_services_count_by_period(UUID, VARCHAR);
        
        CREATE OR REPLACE FUNCTION get_tenant_services_count_by_period(
            p_tenant_id UUID,
            p_period_type VARCHAR(10) DEFAULT '30d'
        )
        RETURNS INTEGER AS $$
        DECLARE
            start_date DATE;
            end_date DATE := CURRENT_DATE;
            services_count INTEGER := 0;
        BEGIN
            CASE p_period_type
                WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
                WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
                WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
                ELSE start_date := end_date - INTERVAL '30 days';
            END CASE;
            
            SELECT COUNT(*)::INTEGER INTO services_count
            FROM services s
            WHERE s.tenant_id = p_tenant_id
            AND s.is_active = true
            AND s.created_at <= end_date::timestamp
            AND (
                s.updated_at IS NULL 
                OR s.updated_at >= start_date::timestamp
            );
            
            RETURN COALESCE(services_count, 0);
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'get_tenant_services_count_by_period ERROR: %', SQLERRM;
                RETURN 0;
        END;
        $$ LANGUAGE plpgsql;
        