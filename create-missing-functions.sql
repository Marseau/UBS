-- 
-- FUNÇÕES POSTGRESQL NECESSÁRIAS PARA O SISTEMA DE MÉTRICAS
-- Baseado no análise do código TypeScript
--

-- 1. FUNÇÃO get_platform_totals
CREATE OR REPLACE FUNCTION get_platform_totals(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_tenants', (SELECT COUNT(*) FROM tenants WHERE status = 'active'),
        'active_tenants', (SELECT COUNT(*) FROM tenants WHERE status = 'active'),
        'total_revenue', COALESCE((
            SELECT SUM(CASE 
                WHEN a.status = 'completed' THEN COALESCE(a.price, 0)
                ELSE 0
            END)
            FROM appointments a
            JOIN tenants t ON a.tenant_id = t.id
            WHERE DATE(a.created_at) BETWEEN p_start_date AND p_end_date
            AND t.status = 'active'
        ), 0),
        'total_appointments', COALESCE((
            SELECT COUNT(*)
            FROM appointments a
            JOIN tenants t ON a.tenant_id = t.id
            WHERE DATE(a.created_at) BETWEEN p_start_date AND p_end_date
            AND t.status = 'active'
        ), 0),
        'total_customers', COALESCE((
            SELECT COUNT(DISTINCT u.id)
            FROM users u
            JOIN tenants t ON u.tenant_id = t.id
            WHERE DATE(u.created_at) BETWEEN p_start_date AND p_end_date
            AND t.status = 'active'
        ), 0),
        'total_conversations', COALESCE((
            SELECT COUNT(*)
            FROM conversation_history ch
            JOIN tenants t ON ch.tenant_id = t.id
            WHERE DATE(ch.created_at) BETWEEN p_start_date AND p_end_date
            AND t.status = 'active'
        ), 0)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 2. FUNÇÃO get_tenant_metrics_for_period
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_period_type TEXT DEFAULT '30d'
)
RETURNS JSON AS $$
DECLARE
    result JSON;
    tenant_exists BOOLEAN;
BEGIN
    -- Verificar se tenant existe
    SELECT EXISTS(SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') INTO tenant_exists;
    
    IF NOT tenant_exists THEN
        RETURN json_build_object(
            'error', 'Tenant not found or inactive',
            'tenant_id', p_tenant_id
        );
    END IF;
    
    SELECT json_build_object(
        'tenant_id', p_tenant_id,
        'period_type', p_period_type,
        'period_start', p_start_date,
        'period_end', p_end_date,
        
        -- Appointment metrics
        'total_appointments', COALESCE((
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'confirmed_appointments', COALESCE((
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND a.status = 'confirmed'
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'cancelled_appointments', COALESCE((
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND a.status = 'cancelled'
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'completed_appointments', COALESCE((
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND a.status = 'completed'
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'pending_appointments', COALESCE((
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND a.status = 'pending'
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        
        -- Revenue metrics
        'monthly_revenue', COALESCE((
            SELECT SUM(CASE 
                WHEN a.status = 'completed' THEN COALESCE(a.price, 0)
                ELSE 0
            END)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'average_value', COALESCE((
            SELECT AVG(CASE 
                WHEN a.status = 'completed' THEN COALESCE(a.price, 0)
                ELSE NULL
            END)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        
        -- Customer metrics
        'new_customers', COALESCE((
            SELECT COUNT(DISTINCT u.id)
            FROM users u
            WHERE u.tenant_id = p_tenant_id
            AND DATE(u.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'returning_customers', COALESCE((
            SELECT COUNT(DISTINCT a.user_id)
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
            AND EXISTS (
                SELECT 1 FROM appointments a2
                WHERE a2.user_id = a.user_id
                AND a2.tenant_id = p_tenant_id
                AND DATE(a2.created_at) < p_start_date
            )
        ), 0),
        
        -- Service metrics
        'total_services', COALESCE((
            SELECT COUNT(DISTINCT s.id)
            FROM services s
            WHERE s.tenant_id = p_tenant_id
            AND s.is_active = true
        ), 0),
        'most_popular_service', COALESCE((
            SELECT s.name
            FROM services s
            JOIN appointments a ON s.id = a.service_id
            WHERE s.tenant_id = p_tenant_id
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
            GROUP BY s.id, s.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), 'N/A'),
        'service_utilization_rate', 85.0, -- Placeholder
        
        -- Conversation metrics
        'total_conversations', COALESCE((
            SELECT COUNT(*)
            FROM conversation_history ch
            WHERE ch.tenant_id = p_tenant_id
            AND DATE(ch.created_at) BETWEEN p_start_date AND p_end_date
        ), 0),
        'ai_success_rate', 87.5, -- Placeholder
        'avg_response_time', 2.3, -- Placeholder
        'conversion_rate', 72.0, -- Placeholder
        'booking_conversion_rate', 68.5, -- Placeholder
        'appointment_success_rate', COALESCE((
            SELECT CASE 
                WHEN COUNT(*) > 0 THEN 
                    (COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT / COUNT(*)::FLOAT) * 100
                ELSE 0
            END
            FROM appointments a
            WHERE a.tenant_id = p_tenant_id
            AND DATE(a.created_at) BETWEEN p_start_date AND p_end_date
        ), 0)
        
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 3. FUNÇÃO calculate_business_health_score
CREATE OR REPLACE FUNCTION calculate_business_health_score(
    p_tenant_id UUID,
    p_period_type TEXT DEFAULT '30d'
)
RETURNS FLOAT AS $$
DECLARE
    score FLOAT DEFAULT 75.0; -- Base score
    appointment_rate FLOAT;
    revenue_trend FLOAT;
BEGIN
    -- Calcular score baseado em métricas simples
    SELECT CASE 
        WHEN COUNT(*) > 50 THEN 85.0
        WHEN COUNT(*) > 20 THEN 75.0
        WHEN COUNT(*) > 5 THEN 65.0
        ELSE 50.0
    END INTO score
    FROM appointments a
    WHERE a.tenant_id = p_tenant_id
    AND DATE(a.created_at) >= CURRENT_DATE - INTERVAL '30 days';
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- 4. FUNÇÃO calculate_risk_score
CREATE OR REPLACE FUNCTION calculate_risk_score(
    p_tenant_id UUID,
    p_period_type TEXT DEFAULT '30d'
)
RETURNS FLOAT AS $$
DECLARE
    risk_score FLOAT DEFAULT 25.0; -- Base risk
    cancellation_rate FLOAT;
BEGIN
    -- Calcular score de risco baseado em cancelamentos
    SELECT CASE 
        WHEN COUNT(*) = 0 THEN 15.0
        ELSE 
            CASE 
                WHEN (COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::FLOAT / COUNT(*)::FLOAT) > 0.3 THEN 75.0
                WHEN (COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::FLOAT / COUNT(*)::FLOAT) > 0.2 THEN 50.0
                WHEN (COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::FLOAT / COUNT(*)::FLOAT) > 0.1 THEN 25.0
                ELSE 15.0
            END
    END INTO risk_score
    FROM appointments a
    WHERE a.tenant_id = p_tenant_id
    AND DATE(a.created_at) >= CURRENT_DATE - INTERVAL '30 days';
    
    RETURN risk_score;
END;
$$ LANGUAGE plpgsql;

-- 5. FUNÇÃO calculate_platform_health_score
CREATE OR REPLACE FUNCTION calculate_platform_health_score(
    p_period_type TEXT DEFAULT '30d'
)
RETURNS FLOAT AS $$
DECLARE
    score FLOAT DEFAULT 80.0;
BEGIN
    -- Score baseado em atividade geral da plataforma
    SELECT CASE 
        WHEN COUNT(DISTINCT tenant_id) >= 10 THEN 90.0
        WHEN COUNT(DISTINCT tenant_id) >= 5 THEN 80.0
        ELSE 70.0
    END INTO score
    FROM appointments
    WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days';
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- 6. FUNÇÃO get_domain_distribution (placeholder)
CREATE OR REPLACE FUNCTION get_domain_distribution(
    start_date DATE,
    end_date DATE
)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'saude', 2,
        'beleza', 3,
        'educacao', 2,
        'juridico', 2,
        'esportes', 1
    );
END;
$$ LANGUAGE plpgsql;

-- 7. FUNÇÃO get_daily_metrics (placeholder)
CREATE OR REPLACE FUNCTION get_daily_metrics(
    tenant_id UUID,
    target_date DATE
)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'revenue', 0,
        'appointments', 0,
        'customers', 0,
        'conversations', 0,
        'service_breakdown', '{}'::JSON
    );
END;
$$ LANGUAGE plpgsql;

-- 8. FUNÇÃO get_platform_daily_metrics (placeholder)
CREATE OR REPLACE FUNCTION get_platform_daily_metrics(
    target_date DATE
)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'revenue', 0,
        'appointments', 0,
        'customers', 0
    );
END;
$$ LANGUAGE plpgsql;

-- Mensagem de confirmação
DO $$ BEGIN
    RAISE NOTICE 'Funções PostgreSQL criadas com sucesso para sistema de métricas!';
END $$;