-- Real Payment Functions - NO FALLBACKS
-- Only real payment data, "dados insuficientes" when no data exists

-- Drop existing functions with fallbacks
DROP FUNCTION IF EXISTS get_platform_totals(DATE, DATE);
DROP FUNCTION IF EXISTS get_tenant_subscription_revenue(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_platform_mrr(DATE);
DROP FUNCTION IF EXISTS get_tenant_revenue_participation_real(UUID, DATE, DATE);

-- Function to get ONLY real platform totals from actual payments
CREATE OR REPLACE FUNCTION get_platform_totals_real_only(
    start_date DATE,
    end_date DATE
)
RETURNS TABLE (
    total_tenants INTEGER,
    active_tenants INTEGER,
    total_revenue DECIMAL(15,2),
    total_appointments INTEGER,
    total_customers INTEGER,
    total_conversations INTEGER,
    has_payment_data BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payment_count INTEGER := 0;
BEGIN
    -- Check if we have any payment data for the period
    SELECT COUNT(*) INTO payment_count
    FROM subscription_payments
    WHERE payment_status = 'completed'
    AND payment_date >= start_date
    AND payment_date <= end_date;
    
    RETURN QUERY
    SELECT 
        -- Total tenants
        COALESCE(COUNT(DISTINCT t.id)::INTEGER, 0) as total_tenants,
        
        -- Active tenants (have activity in the period)
        COALESCE((
            SELECT COUNT(DISTINCT t2.id)::INTEGER
            FROM tenants t2 
            LEFT JOIN appointments a ON t2.id = a.tenant_id 
                AND a.created_at >= start_date::timestamp 
                AND a.created_at <= end_date::timestamp
            LEFT JOIN conversation_history ch ON t2.id = ch.tenant_id
                AND ch.created_at >= start_date::timestamp 
                AND ch.created_at <= end_date::timestamp
            WHERE t2.status = 'active' 
            AND (a.id IS NOT NULL OR ch.id IS NOT NULL)
        ), 0) as active_tenants,
        
        -- ONLY REAL REVENUE from payments table - NULL if no data
        CASE 
            WHEN payment_count > 0 THEN
                COALESCE((
                    SELECT SUM(sp.amount)::DECIMAL(15,2)
                    FROM subscription_payments sp
                    WHERE sp.payment_status = 'completed'
                    AND sp.payment_date >= start_date
                    AND sp.payment_date <= end_date
                ), 0)
            ELSE NULL  -- No payment data = "dados insuficientes"
        END as total_revenue,
        
        -- Total appointments in period
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM appointments a 
            WHERE a.created_at >= start_date::timestamp 
            AND a.created_at <= end_date::timestamp
        ), 0) as total_appointments,
        
        -- Total unique customers in period
        COALESCE((
            SELECT COUNT(DISTINCT ut.user_id)::INTEGER
            FROM user_tenants ut
            JOIN appointments a ON ut.user_id = a.user_id AND ut.tenant_id = a.tenant_id
            WHERE a.created_at >= start_date::timestamp 
            AND a.created_at <= end_date::timestamp
        ), 0) as total_customers,
        
        -- Total conversations in period
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history ch
            WHERE ch.created_at >= start_date::timestamp 
            AND ch.created_at <= end_date::timestamp
        ), 0) as total_conversations,
        
        -- Flag indicating if we have payment data
        (payment_count > 0) as has_payment_data
        
    FROM tenants t
    WHERE t.status = 'active';
END;
$$;

-- Function to get ONLY real tenant subscription revenue
CREATE OR REPLACE FUNCTION get_tenant_real_revenue_only(
    p_tenant_id UUID,
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    revenue DECIMAL(15,2),
    has_data BOOLEAN,
    payment_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calc_start_date DATE;
    calc_end_date DATE;
    tenant_revenue DECIMAL(15,2) := 0;
    payment_records INTEGER := 0;
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    -- Get ONLY real payments - no fallback calculations
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO tenant_revenue, payment_records
    FROM subscription_payments
    WHERE tenant_id = p_tenant_id
      AND payment_status = 'completed'
      AND payment_date >= calc_start_date
      AND payment_date <= calc_end_date;
    
    RETURN QUERY
    SELECT 
        CASE WHEN payment_records > 0 THEN tenant_revenue ELSE NULL END,
        (payment_records > 0),
        payment_records;
END;
$$;

-- Function to get real platform MRR - only from actual payments
CREATE OR REPLACE FUNCTION get_platform_mrr_real_only(
    target_month DATE DEFAULT NULL
)
RETURNS TABLE (
    mrr DECIMAL(15,2),
    has_data BOOLEAN,
    payment_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calc_month DATE;
    month_start DATE;
    month_end DATE;
    platform_mrr DECIMAL(15,2) := 0;
    payment_records INTEGER := 0;
BEGIN
    -- Default to current month if no date provided
    calc_month := COALESCE(target_month, CURRENT_DATE);
    month_start := DATE_TRUNC('month', calc_month)::DATE;
    month_end := (DATE_TRUNC('month', calc_month) + INTERVAL '1 month - 1 day')::DATE;
    
    -- Get ONLY real payments for the month
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO platform_mrr, payment_records
    FROM subscription_payments
    WHERE payment_status = 'completed'
      AND payment_period_start <= month_end
      AND payment_period_end >= month_start;
    
    RETURN QUERY
    SELECT 
        CASE WHEN payment_records > 0 THEN platform_mrr ELSE NULL END,
        (payment_records > 0),
        payment_records;
END;
$$;

-- Function to get tenant revenue participation - only from real data
CREATE OR REPLACE FUNCTION get_tenant_participation_real_only(
    p_tenant_id UUID,
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    revenue_participation DECIMAL(5,2),
    tenant_revenue DECIMAL(15,2),
    platform_revenue DECIMAL(15,2),
    has_sufficient_data BOOLEAN,
    data_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calc_start_date DATE;
    calc_end_date DATE;
    t_revenue DECIMAL(15,2);
    t_has_data BOOLEAN;
    p_revenue DECIMAL(15,2);
    p_has_data BOOLEAN;
    participation DECIMAL(5,2) := NULL;
    status_msg TEXT := 'dados insuficientes';
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    -- Get tenant real revenue
    SELECT revenue, has_data 
    INTO t_revenue, t_has_data
    FROM get_tenant_real_revenue_only(p_tenant_id, calc_start_date, calc_end_date);
    
    -- Get platform real revenue
    SELECT total_revenue, has_payment_data
    INTO p_revenue, p_has_data
    FROM get_platform_totals_real_only(calc_start_date, calc_end_date);
    
    -- Calculate participation only if both have real data
    IF t_has_data AND p_has_data AND p_revenue > 0 THEN
        participation := (t_revenue / p_revenue) * 100;
        status_msg := 'dados reais';
    ELSIF NOT t_has_data THEN
        status_msg := 'dados insuficientes - sem pagamentos do tenant';
    ELSIF NOT p_has_data THEN
        status_msg := 'dados insuficientes - sem dados da plataforma';
    ELSIF p_revenue = 0 THEN
        status_msg := 'dados insuficientes - receita da plataforma zero';
    END IF;
    
    RETURN QUERY
    SELECT 
        participation,
        t_revenue,
        p_revenue,
        (t_has_data AND p_has_data AND p_revenue > 0),
        status_msg;
END;
$$;

-- Function to get payment summary with real data status
CREATE OR REPLACE FUNCTION get_payment_summary_real_only(
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    total_revenue DECIMAL(15,2),
    payment_count INTEGER,
    avg_payment DECIMAL(15,2),
    last_payment_date DATE,
    current_plan TEXT,
    participation_percentage DECIMAL(5,2),
    has_payment_data BOOLEAN,
    data_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calc_start_date DATE;
    calc_end_date DATE;
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.business_name as tenant_name,
        sp_summary.total_revenue,
        sp_summary.payment_count,
        sp_summary.avg_payment,
        sp_summary.last_payment_date,
        t.subscription_plan as current_plan,
        participation.revenue_participation,
        sp_summary.has_payments,
        CASE 
            WHEN sp_summary.has_payments THEN 'dados reais'
            ELSE 'dados insuficientes'
        END as data_status
    FROM tenants t
    LEFT JOIN (
        SELECT 
            sp.tenant_id,
            SUM(sp.amount) as total_revenue,
            COUNT(sp.id)::INTEGER as payment_count,
            AVG(sp.amount) as avg_payment,
            MAX(sp.payment_date) as last_payment_date,
            (COUNT(sp.id) > 0) as has_payments
        FROM subscription_payments sp
        WHERE sp.payment_status = 'completed'
            AND sp.payment_date >= calc_start_date
            AND sp.payment_date <= calc_end_date
        GROUP BY sp.tenant_id
    ) sp_summary ON t.id = sp_summary.tenant_id
    LEFT JOIN LATERAL (
        SELECT revenue_participation
        FROM get_tenant_participation_real_only(t.id, calc_start_date, calc_end_date)
    ) participation ON true
    WHERE t.status = 'active'
    ORDER BY COALESCE(sp_summary.total_revenue, 0) DESC;
END;
$$;

-- Create a view for easy dashboard access
CREATE OR REPLACE VIEW dashboard_metrics_real AS
SELECT 
    'platform_totals' as metric_type,
    jsonb_build_object(
        'total_tenants', pt.total_tenants,
        'active_tenants', pt.active_tenants,
        'total_revenue', pt.total_revenue,
        'total_appointments', pt.total_appointments,
        'total_customers', pt.total_customers,
        'total_conversations', pt.total_conversations,
        'has_payment_data', pt.has_payment_data,
        'data_status', CASE WHEN pt.has_payment_data THEN 'dados reais' ELSE 'dados insuficientes' END
    ) as data
FROM get_platform_totals_real_only(
    DATE_TRUNC('month', CURRENT_DATE)::DATE,
    CURRENT_DATE
) pt

UNION ALL

SELECT 
    'platform_mrr' as metric_type,
    jsonb_build_object(
        'mrr', pm.mrr,
        'has_data', pm.has_data,
        'payment_count', pm.payment_count,
        'data_status', CASE WHEN pm.has_data THEN 'dados reais' ELSE 'dados insuficientes' END
    ) as data
FROM get_platform_mrr_real_only() pm;

COMMENT ON FUNCTION get_platform_totals_real_only IS 'Gets platform totals using ONLY real payment data - returns NULL for revenue if no payments exist';
COMMENT ON FUNCTION get_tenant_real_revenue_only IS 'Gets tenant real revenue - NULL if no payments recorded';
COMMENT ON FUNCTION get_platform_mrr_real_only IS 'Gets real platform MRR - NULL if no payment data';
COMMENT ON FUNCTION get_tenant_participation_real_only IS 'Calculates tenant participation using ONLY real payment data';
COMMENT ON VIEW dashboard_metrics_real IS 'View for dashboard showing real payment data with "dados insuficientes" status';

-- Test the new functions
SELECT 'Platform Totals (Real Only):' as test;
SELECT * FROM get_platform_totals_real_only(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE);

SELECT 'Platform MRR (Real Only):' as test;
SELECT * FROM get_platform_mrr_real_only();

SELECT 'Payment Summary (Real Only):' as test;
SELECT * FROM get_payment_summary_real_only() LIMIT 3;