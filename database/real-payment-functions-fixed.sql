-- Real Payment Functions - FIXED VERSION
-- Functions that return NULL when no real data exists
-- FIXED: Removed auth.tenant_id() references

-- Function to get real tenant revenue only (no fallbacks)
CREATE OR REPLACE FUNCTION get_tenant_real_revenue_only(
    p_tenant_id UUID
)
RETURNS TABLE (
    revenue DECIMAL,
    has_data BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_revenue DECIMAL(15,2) := 0;
    payment_count INTEGER := 0;
BEGIN
    -- Get actual payments from subscription_payments table
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO total_revenue, payment_count
    FROM subscription_payments 
    WHERE tenant_id = p_tenant_id 
    AND payment_status = 'completed'
    AND payment_date >= DATE_TRUNC('month', CURRENT_DATE);
    
    -- Return NULL if no real payment data exists
    IF payment_count = 0 THEN
        RETURN QUERY SELECT NULL::DECIMAL, FALSE;
    ELSE
        RETURN QUERY SELECT total_revenue, TRUE;
    END IF;
END;
$$;

-- Function to get tenant participation in platform
CREATE OR REPLACE FUNCTION get_tenant_participation(
    p_tenant_id UUID,
    p_period_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    tenant_revenue DECIMAL,
    platform_total_revenue DECIMAL,
    revenue_percentage DECIMAL,
    has_sufficient_data BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tenant_rev DECIMAL(15,2) := 0;
    platform_rev DECIMAL(15,2) := 0;
    period_start DATE;
    tenant_payment_count INTEGER := 0;
    platform_payment_count INTEGER := 0;
BEGIN
    period_start := CURRENT_DATE - INTERVAL '1 day' * p_period_days;
    
    -- Get tenant revenue from real payments
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO tenant_rev, tenant_payment_count
    FROM subscription_payments 
    WHERE tenant_id = p_tenant_id 
    AND payment_status = 'completed'
    AND payment_date >= period_start;
    
    -- Get platform total revenue from real payments
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO platform_rev, platform_payment_count
    FROM subscription_payments 
    WHERE payment_status = 'completed'
    AND payment_date >= period_start;
    
    -- Return data only if we have real payments
    IF tenant_payment_count > 0 AND platform_payment_count > 0 AND platform_rev > 0 THEN
        RETURN QUERY SELECT 
            tenant_rev,
            platform_rev,
            ROUND((tenant_rev / platform_rev * 100)::DECIMAL, 2),
            TRUE;
    ELSE
        RETURN QUERY SELECT 
            NULL::DECIMAL,
            NULL::DECIMAL, 
            NULL::DECIMAL,
            FALSE;
    END IF;
END;
$$;

-- Function to calculate monthly recurring revenue from real payments
CREATE OR REPLACE FUNCTION calculate_platform_mrr()
RETURNS DECIMAL(15,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_month_mrr DECIMAL(15,2) := 0;
BEGIN
    -- Calculate MRR from actual payments in current month
    SELECT COALESCE(SUM(amount), 0)
    INTO current_month_mrr
    FROM subscription_payments 
    WHERE payment_status = 'completed'
    AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND payment_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month');
    
    RETURN current_month_mrr;
END;
$$;

-- Function to get platform revenue summary
CREATE OR REPLACE FUNCTION get_platform_revenue_summary(
    p_period_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_revenue DECIMAL,
    mrr DECIMAL,
    active_paying_tenants INTEGER,
    has_revenue_data BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER  
AS $$
DECLARE
    period_start DATE;
    total_rev DECIMAL(15,2) := 0;
    monthly_rev DECIMAL(15,2) := 0;
    paying_tenants INTEGER := 0;
    payment_count INTEGER := 0;
BEGIN
    period_start := CURRENT_DATE - INTERVAL '1 day' * p_period_days;
    
    -- Get total revenue in period
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*)
    INTO total_rev, payment_count
    FROM subscription_payments 
    WHERE payment_status = 'completed'
    AND payment_date >= period_start;
    
    -- Get MRR from current month
    monthly_rev := calculate_platform_mrr();
    
    -- Count active paying tenants
    SELECT COUNT(DISTINCT tenant_id)
    INTO paying_tenants
    FROM subscription_payments 
    WHERE payment_status = 'completed'
    AND payment_date >= period_start;
    
    -- Return data only if we have real payments
    IF payment_count > 0 THEN
        RETURN QUERY SELECT 
            total_rev,
            monthly_rev,
            paying_tenants,
            TRUE;
    ELSE
        RETURN QUERY SELECT 
            NULL::DECIMAL,
            NULL::DECIMAL,
            NULL::INTEGER,
            FALSE;
    END IF;
END;
$$;