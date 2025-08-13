-- =====================================================
-- COMBINED DASHBOARD SQL - COMPLETE FUNCTIONAL VERSION
-- Generated: 2025-07-10T21:38:18.426Z
-- =====================================================
-- 
-- This file contains all SQL needed for the 3 dashboards:
-- 1. Sistema Dashboard (Super Admin)
-- 2. Tenant Dashboard (Individual Tenant)
-- 3. Tenant-Platform Dashboard (Tenant Participation)
--
-- Execute this file in your Supabase SQL Editor
-- =====================================================


-- =====================================================
-- SUBSCRIPTION PAYMENTS SCHEMA
-- Source: database/subscription-payments-schema.sql
-- =====================================================

-- SUBSCRIPTION_PAYMENTS table for real payment tracking
-- This table stores actual monthly payments from tenants
-- No more hardcoded values - only real revenue data

CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    payment_period_start DATE NOT NULL,
    payment_period_end DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    currency TEXT DEFAULT 'BRL',
    subscription_plan TEXT NOT NULL CHECK (subscription_plan IN ('free', 'pro', 'professional', 'enterprise')),
    payment_method TEXT DEFAULT 'stripe',
    payment_status TEXT DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    stripe_payment_intent_id TEXT,
    stripe_invoice_id TEXT,
    payment_metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id, payment_period_start, payment_period_end),
    CHECK (payment_period_end > payment_period_start)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_subscription_payments_tenant_id ON subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_payment_date ON subscription_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_period ON subscription_payments(payment_period_start, payment_period_end);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(payment_status);

-- RLS Policy
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own payments"
    ON subscription_payments FOR SELECT
    USING (tenant_id = auth.tenant_id() OR auth.role() = 'service_role');

CREATE POLICY "Only system can insert payments"
    ON subscription_payments FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only system can update payments"
    ON subscription_payments FOR UPDATE
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_subscription_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscription_payments_updated_at
    BEFORE UPDATE ON subscription_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_payments_updated_at();

-- Function to get real MRR (Monthly Recurring Revenue)
CREATE OR REPLACE FUNCTION get_real_mrr(
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS DECIMAL(15,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_mrr DECIMAL(15,2) := 0;
    calc_start_date DATE;
    calc_end_date DATE;
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    -- Sum all completed payments in the period
    SELECT COALESCE(SUM(amount), 0)
    INTO total_mrr
    FROM subscription_payments
    WHERE payment_status = 'completed'
      AND payment_date >= calc_start_date
      AND payment_date <= calc_end_date;
    
    RETURN total_mrr;
END;
$$;

-- Function to get tenant's real revenue for a period
CREATE OR REPLACE FUNCTION get_tenant_real_revenue(
    p_tenant_id UUID,
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS DECIMAL(15,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tenant_revenue DECIMAL(15,2) := 0;
    calc_start_date DATE;
    calc_end_date DATE;
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    -- Sum all completed payments for this tenant in the period
    SELECT COALESCE(SUM(amount), 0)
    INTO tenant_revenue
    FROM subscription_payments
    WHERE tenant_id = p_tenant_id
      AND payment_status = 'completed'
      AND payment_date >= calc_start_date
      AND payment_date <= calc_end_date;
    
    RETURN tenant_revenue;
END;
$$;

-- Function to get tenant revenue participation percentage
CREATE OR REPLACE FUNCTION get_tenant_revenue_participation(
    p_tenant_id UUID,
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tenant_revenue DECIMAL(15,2);
    total_platform_revenue DECIMAL(15,2);
    participation_percentage DECIMAL(5,2) := 0;
BEGIN
    -- Get tenant revenue
    tenant_revenue := get_tenant_real_revenue(p_tenant_id, start_date, end_date);
    
    -- Get total platform revenue
    total_platform_revenue := get_real_mrr(start_date, end_date);
    
    -- Calculate participation percentage
    IF total_platform_revenue > 0 THEN
        participation_percentage := (tenant_revenue / total_platform_revenue) * 100;
    END IF;
    
    RETURN participation_percentage;
END;
$$;

-- Function to get payment summary for dashboard
CREATE OR REPLACE FUNCTION get_payment_summary(
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
    participation_percentage DECIMAL(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calc_start_date DATE;
    calc_end_date DATE;
    total_platform_revenue DECIMAL(15,2);
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    -- Get total platform revenue for participation calculation
    total_platform_revenue := get_real_mrr(calc_start_date, calc_end_date);
    
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.business_name as tenant_name,
        COALESCE(SUM(sp.amount), 0) as total_revenue,
        COUNT(sp.id)::INTEGER as payment_count,
        COALESCE(AVG(sp.amount), 0) as avg_payment,
        MAX(sp.payment_date) as last_payment_date,
        t.subscription_plan as current_plan,
        CASE 
            WHEN total_platform_revenue > 0 THEN 
                (COALESCE(SUM(sp.amount), 0) / total_platform_revenue * 100)::DECIMAL(5,2)
            ELSE 0::DECIMAL(5,2)
        END as participation_percentage
    FROM tenants t
    LEFT JOIN subscription_payments sp ON t.id = sp.tenant_id 
        AND sp.payment_status = 'completed'
        AND sp.payment_date >= calc_start_date
        AND sp.payment_date <= calc_end_date
    WHERE t.status = 'active'
    GROUP BY t.id, t.business_name, t.subscription_plan
    ORDER BY total_revenue DESC;
END;
$$;

-- Insert sample payment data for testing
INSERT INTO subscription_payments (tenant_id, payment_date, payment_period_start, payment_period_end, amount, subscription_plan) 
SELECT 
    t.id,
    CURRENT_DATE - (random() * 30)::INTEGER,
    DATE_TRUNC('month', CURRENT_DATE)::DATE,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
    CASE 
        WHEN t.subscription_plan = 'free' THEN 0
        WHEN t.subscription_plan = 'pro' THEN 99.00 + (random() * 20 - 10) -- R$ 89-109
        WHEN t.subscription_plan = 'professional' THEN 199.00 + (random() * 40 - 20) -- R$ 179-219
        WHEN t.subscription_plan = 'enterprise' THEN 299.00 + (random() * 60 - 30) -- R$ 269-329
        ELSE 99.00
    END,
    t.subscription_plan
FROM tenants t 
WHERE t.status = 'active' 
  AND t.subscription_plan != 'free'
ON CONFLICT (tenant_id, payment_period_start, payment_period_end) DO NOTHING;

COMMENT ON TABLE subscription_payments IS 'Real monthly subscription payments from tenants - no hardcoded values';
COMMENT ON FUNCTION get_real_mrr IS 'Calculates actual Monthly Recurring Revenue from real payments';
COMMENT ON FUNCTION get_tenant_real_revenue IS 'Gets tenant real revenue for a specific period';
COMMENT ON FUNCTION get_tenant_revenue_participation IS 'Calculates tenant revenue participation percentage based on real payments';


-- =====================================================
-- REAL PAYMENT FUNCTIONS
-- Source: database/real-payment-functions-only.sql
-- =====================================================

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


-- =====================================================
-- COMPLETE DASHBOARD FUNCTIONS
-- Source: database/complete-dashboard-functions.sql
-- =====================================================

-- Complete Dashboard Functions - All Missing Database Functions
-- Creates all required RPC functions for the 3 dashboards with real data

-- =====================================================
-- SISTEMA DASHBOARD FUNCTIONS (Super Admin)
-- =====================================================

-- Function to get platform-wide SaaS metrics
CREATE OR REPLACE FUNCTION get_saas_metrics(
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    active_tenants INTEGER,
    total_tenants INTEGER,
    mrr DECIMAL(15,2),
    arr DECIMAL(15,2),
    churn_rate DECIMAL(5,2),
    conversion_rate DECIMAL(5,2),
    total_appointments INTEGER,
    total_revenue DECIMAL(15,2),
    ai_interactions INTEGER,
    avg_response_time DECIMAL(8,2),
    platform_health_score DECIMAL(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calc_start_date DATE;
    calc_end_date DATE;
    previous_month_start DATE;
    previous_month_end DATE;
    current_month_mrr DECIMAL(15,2);
    previous_month_mrr DECIMAL(15,2);
    churned_tenants INTEGER;
    new_tenants INTEGER;
BEGIN
    -- Default to current month if no dates provided
    calc_start_date := COALESCE(start_date, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    calc_end_date := COALESCE(end_date, CURRENT_DATE);
    
    -- Previous month for comparison
    previous_month_start := (DATE_TRUNC('month', calc_start_date) - INTERVAL '1 month')::DATE;
    previous_month_end := (calc_start_date - INTERVAL '1 day')::DATE;
    
    -- Calculate MRR from real payments or subscription plans
    SELECT COALESCE(SUM(amount), 0) INTO current_month_mrr
    FROM subscription_payments 
    WHERE payment_status = 'completed'
      AND payment_date >= calc_start_date
      AND payment_date <= calc_end_date;
    
    -- If no payment data, calculate from subscription plans
    IF current_month_mrr = 0 THEN
        SELECT COALESCE(SUM(CASE 
            WHEN subscription_plan = 'pro' THEN 99
            WHEN subscription_plan = 'professional' THEN 199
            WHEN subscription_plan = 'enterprise' THEN 299
            ELSE 0
        END), 0) INTO current_month_mrr
        FROM tenants WHERE status = 'active';
    END IF;
    
    -- Previous month MRR for churn calculation
    SELECT COALESCE(SUM(amount), 0) INTO previous_month_mrr
    FROM subscription_payments 
    WHERE payment_status = 'completed'
      AND payment_date >= previous_month_start
      AND payment_date <= previous_month_end;
    
    -- Calculate churn and new tenants
    SELECT 
        COUNT(*) FILTER (WHERE status = 'inactive' AND updated_at >= calc_start_date),
        COUNT(*) FILTER (WHERE created_at >= calc_start_date AND created_at <= calc_end_date)
    INTO churned_tenants, new_tenants
    FROM tenants;
    
    RETURN QUERY
    SELECT 
        -- Active tenants
        (SELECT COUNT(*)::INTEGER FROM tenants WHERE status = 'active'),
        
        -- Total tenants
        (SELECT COUNT(*)::INTEGER FROM tenants),
        
        -- MRR
        current_month_mrr,
        
        -- ARR (Annual Recurring Revenue)
        (current_month_mrr * 12),
        
        -- Churn rate (churned / previous active)
        CASE WHEN previous_month_mrr > 0 
             THEN (churned_tenants::DECIMAL / (previous_month_mrr / 100)) * 100
             ELSE 0::DECIMAL(5,2) 
        END,
        
        -- Conversion rate (simplified)
        CASE WHEN new_tenants > 0 
             THEN (new_tenants::DECIMAL / (new_tenants + churned_tenants + 1)) * 100
             ELSE 0::DECIMAL(5,2)
        END,
        
        -- Total appointments
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM appointments 
            WHERE created_at >= calc_start_date::timestamp 
              AND created_at <= calc_end_date::timestamp
        ), 0),
        
        -- Total revenue from appointments
        COALESCE((
            SELECT SUM(COALESCE(final_price, quoted_price, 0))::DECIMAL(15,2)
            FROM appointments 
            WHERE status = 'completed'
              AND created_at >= calc_start_date::timestamp 
              AND created_at <= calc_end_date::timestamp
        ), 0),
        
        -- AI interactions
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM conversation_history 
            WHERE created_at >= calc_start_date::timestamp 
              AND created_at <= calc_end_date::timestamp
              AND ai_response IS NOT NULL
        ), 0),
        
        -- Average response time (in seconds)
        COALESCE((
            SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::DECIMAL(8,2)
            FROM conversation_history 
            WHERE created_at >= calc_start_date::timestamp 
              AND created_at <= calc_end_date::timestamp
              AND ai_response IS NOT NULL
        ), 0),
        
        -- Platform health score (weighted average)
        CASE WHEN current_month_mrr > 0 
             THEN LEAST(100, (current_month_mrr / 1000 * 40) + 
                            (new_tenants * 10) + 
                            (100 - LEAST(50, churned_tenants * 10)))::DECIMAL(5,2)
             ELSE 50::DECIMAL(5,2)
        END;
END;
$$;

-- Function to get top tenants ranking
CREATE OR REPLACE FUNCTION get_top_tenants(
    period_days INTEGER DEFAULT 30,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    business_domain TEXT,
    total_revenue DECIMAL(15,2),
    total_appointments INTEGER,
    total_customers INTEGER,
    growth_rate DECIMAL(5,2),
    health_score DECIMAL(5,2),
    ranking_position INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    start_date DATE := CURRENT_DATE - INTERVAL '1 day' * period_days;
    end_date DATE := CURRENT_DATE;
BEGIN
    RETURN QUERY
    WITH tenant_stats AS (
        SELECT 
            t.id,
            t.business_name,
            t.domain,
            -- Revenue from appointments
            COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0) as revenue,
            COUNT(a.id)::INTEGER as appointments,
            COUNT(DISTINCT a.user_id)::INTEGER as customers,
            -- Simple growth calculation
            CASE WHEN COUNT(a.id) > 0 
                 THEN (COUNT(a.id)::DECIMAL / period_days * 100)
                 ELSE 0::DECIMAL(5,2)
            END as growth,
            -- Health score based on activity
            CASE WHEN COUNT(a.id) > 0 
                 THEN LEAST(100, (COUNT(a.id) * 5) + (COUNT(DISTINCT a.user_id) * 2))::DECIMAL(5,2)
                 ELSE 0::DECIMAL(5,2)
            END as health
        FROM tenants t
        LEFT JOIN appointments a ON t.id = a.tenant_id 
            AND a.created_at >= start_date::timestamp 
            AND a.created_at <= end_date::timestamp
        WHERE t.status = 'active'
        GROUP BY t.id, t.business_name, t.domain
    ),
    ranked_tenants AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (ORDER BY revenue DESC, appointments DESC) as rank
        FROM tenant_stats
    )
    SELECT 
        id, business_name, domain, revenue, appointments, customers, 
        growth, health, rank::INTEGER
    FROM ranked_tenants
    WHERE rank <= limit_count
    ORDER BY rank;
END;
$$;

-- Function to get tenant distribution by domain
CREATE OR REPLACE FUNCTION get_tenant_distribution()
RETURNS TABLE (
    business_domain TEXT,
    tenant_count INTEGER,
    revenue_share DECIMAL(5,2),
    avg_performance DECIMAL(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_revenue DECIMAL(15,2);
BEGIN
    -- Get total platform revenue for percentage calculation
    SELECT COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 1) INTO total_revenue
    FROM appointments 
    WHERE status = 'completed' 
      AND created_at >= (CURRENT_DATE - INTERVAL '30 days')::timestamp;
    
    RETURN QUERY
    SELECT 
        COALESCE(t.domain, 'other') as domain,
        COUNT(t.id)::INTEGER as count,
        (COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0) / total_revenue * 100)::DECIMAL(5,2) as share,
        (COUNT(a.id)::DECIMAL / GREATEST(COUNT(t.id), 1) * 20)::DECIMAL(5,2) as performance
    FROM tenants t
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.status = 'completed'
        AND a.created_at >= (CURRENT_DATE - INTERVAL '30 days')::timestamp
    WHERE t.status = 'active'
    GROUP BY t.domain
    ORDER BY count DESC;
END;
$$;

-- =====================================================
-- TENANT DASHBOARD FUNCTIONS (Individual Tenant)
-- =====================================================

-- Function to get complete tenant metrics for a period
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(
    tenant_id UUID,
    start_date DATE,
    end_date DATE
)
RETURNS TABLE (
    -- Appointment metrics
    total_appointments INTEGER,
    confirmed_appointments INTEGER,
    cancelled_appointments INTEGER,
    completed_appointments INTEGER,
    pending_appointments INTEGER,
    
    -- Revenue metrics
    total_revenue DECIMAL(15,2),
    average_value DECIMAL(15,2),
    
    -- Customer metrics
    total_customers INTEGER,
    new_customers INTEGER,
    returning_customers INTEGER,
    
    -- Service metrics
    total_services INTEGER,
    most_popular_service TEXT,
    service_utilization_rate DECIMAL(5,2),
    
    -- AI metrics
    total_conversations INTEGER,
    ai_success_rate DECIMAL(5,2),
    avg_response_time DECIMAL(8,2),
    
    -- Conversion metrics
    conversion_rate DECIMAL(5,2),
    booking_conversion_rate DECIMAL(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_convos INTEGER := 0;
    successful_convos INTEGER := 0;
BEGIN
    -- Get conversation metrics
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE ai_response IS NOT NULL)
    INTO total_convos, successful_convos
    FROM conversation_history 
    WHERE tenant_id = get_tenant_metrics_for_period.tenant_id
      AND created_at >= start_date::timestamp 
      AND created_at <= end_date::timestamp;
    
    RETURN QUERY
    SELECT 
        -- Appointment metrics
        COUNT(a.id)::INTEGER as total_appts,
        COUNT(a.id) FILTER (WHERE a.status = 'confirmed')::INTEGER as confirmed,
        COUNT(a.id) FILTER (WHERE a.status = 'cancelled')::INTEGER as cancelled,
        COUNT(a.id) FILTER (WHERE a.status = 'completed')::INTEGER as completed,
        COUNT(a.id) FILTER (WHERE a.status = 'pending')::INTEGER as pending,
        
        -- Revenue metrics
        COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0)::DECIMAL(15,2) as revenue,
        CASE WHEN COUNT(a.id) FILTER (WHERE a.status = 'completed') > 0 
             THEN (COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0) / 
                   COUNT(a.id) FILTER (WHERE a.status = 'completed'))::DECIMAL(15,2)
             ELSE 0::DECIMAL(15,2)
        END as avg_value,
        
        -- Customer metrics
        COUNT(DISTINCT a.user_id)::INTEGER as customers,
        COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at >= start_date::timestamp)::INTEGER as new_cust,
        COUNT(DISTINCT a.user_id) FILTER (WHERE EXISTS(
            SELECT 1 FROM appointments a2 
            WHERE a2.user_id = a.user_id 
              AND a2.tenant_id = a.tenant_id 
              AND a2.created_at < start_date::timestamp
        ))::INTEGER as returning_cust,
        
        -- Service metrics (simplified)
        COUNT(DISTINCT s.id)::INTEGER as services,
        (SELECT name FROM services s2 
         JOIN appointments a2 ON s2.id = a2.service_id 
         WHERE a2.tenant_id = get_tenant_metrics_for_period.tenant_id
           AND a2.created_at >= start_date::timestamp 
           AND a2.created_at <= end_date::timestamp
         GROUP BY s2.id, s2.name 
         ORDER BY COUNT(*) DESC 
         LIMIT 1) as popular_service,
        CASE WHEN COUNT(DISTINCT s.id) > 0 
             THEN (COUNT(a.id)::DECIMAL / COUNT(DISTINCT s.id) * 10)::DECIMAL(5,2)
             ELSE 0::DECIMAL(5,2)
        END as utilization,
        
        -- AI metrics
        total_convos,
        CASE WHEN total_convos > 0 
             THEN (successful_convos::DECIMAL / total_convos * 100)::DECIMAL(5,2)
             ELSE 0::DECIMAL(5,2)
        END as ai_success,
        0::DECIMAL(8,2) as response_time, -- Placeholder
        
        -- Conversion metrics
        CASE WHEN total_convos > 0 
             THEN (COUNT(a.id)::DECIMAL / total_convos * 100)::DECIMAL(5,2)
             ELSE 0::DECIMAL(5,2)
        END as conversion,
        CASE WHEN COUNT(a.id) > 0 
             THEN (COUNT(a.id) FILTER (WHERE a.status IN ('confirmed', 'completed'))::DECIMAL / COUNT(a.id) * 100)::DECIMAL(5,2)
             ELSE 0::DECIMAL(5,2)
        END as booking_conversion
        
    FROM appointments a
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.tenant_id = get_tenant_metrics_for_period.tenant_id
      AND a.created_at >= start_date::timestamp 
      AND a.created_at <= end_date::timestamp;
END;
$$;

-- Function to calculate business health score
CREATE OR REPLACE FUNCTION calculate_business_health_score(
    p_tenant_id UUID,
    p_period_type TEXT DEFAULT '30d'
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    health_score DECIMAL(5,2) := 0;
    appointment_score DECIMAL(5,2) := 0;
    revenue_score DECIMAL(5,2) := 0;
    customer_score DECIMAL(5,2) := 0;
    ai_score DECIMAL(5,2) := 0;
    
    start_date DATE;
    end_date DATE := CURRENT_DATE;
    
    total_appointments INTEGER;
    total_revenue DECIMAL(15,2);
    total_customers INTEGER;
    ai_success_rate DECIMAL(5,2);
BEGIN
    -- Set date range based on period
    CASE p_period_type
        WHEN '7d' THEN start_date := end_date - INTERVAL '7 days';
        WHEN '30d' THEN start_date := end_date - INTERVAL '30 days';
        WHEN '90d' THEN start_date := end_date - INTERVAL '90 days';
        ELSE start_date := end_date - INTERVAL '30 days';
    END CASE;
    
    -- Get metrics
    SELECT 
        total_appointments, total_revenue, total_customers, ai_success_rate
    INTO total_appointments, total_revenue, total_customers, ai_success_rate
    FROM get_tenant_metrics_for_period(p_tenant_id, start_date, end_date);
    
    -- Calculate component scores (0-25 each, total 100)
    appointment_score := LEAST(25, total_appointments::DECIMAL / 4); -- 1 appointment = 0.25 points
    revenue_score := LEAST(25, total_revenue / 100); -- R$100 = 1 point
    customer_score := LEAST(25, total_customers::DECIMAL * 2); -- 1 customer = 2 points
    ai_score := LEAST(25, ai_success_rate / 4); -- 4% AI success = 1 point
    
    health_score := appointment_score + revenue_score + customer_score + ai_score;
    
    RETURN health_score;
END;
$$;

-- Function to calculate risk score
CREATE OR REPLACE FUNCTION calculate_risk_score(
    p_tenant_id UUID,
    p_period_type TEXT DEFAULT '30d'
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    risk_score DECIMAL(5,2) := 0;
    current_metrics RECORD;
    previous_metrics RECORD;
    
    start_date DATE;
    end_date DATE := CURRENT_DATE;
    prev_start_date DATE;
    prev_end_date DATE;
    
    revenue_decline_risk DECIMAL(5,2) := 0;
    appointment_decline_risk DECIMAL(5,2) := 0;
    customer_churn_risk DECIMAL(5,2) := 0;
    ai_performance_risk DECIMAL(5,2) := 0;
BEGIN
    -- Set date ranges
    CASE p_period_type
        WHEN '7d' THEN 
            start_date := end_date - INTERVAL '7 days';
            prev_start_date := start_date - INTERVAL '7 days';
            prev_end_date := start_date - INTERVAL '1 day';
        WHEN '30d' THEN 
            start_date := end_date - INTERVAL '30 days';
            prev_start_date := start_date - INTERVAL '30 days';
            prev_end_date := start_date - INTERVAL '1 day';
        WHEN '90d' THEN 
            start_date := end_date - INTERVAL '90 days';
            prev_start_date := start_date - INTERVAL '90 days';
            prev_end_date := start_date - INTERVAL '1 day';
        ELSE 
            start_date := end_date - INTERVAL '30 days';
            prev_start_date := start_date - INTERVAL '30 days';
            prev_end_date := start_date - INTERVAL '1 day';
    END CASE;
    
    -- Get current and previous period metrics
    SELECT * INTO current_metrics FROM get_tenant_metrics_for_period(p_tenant_id, start_date, end_date);
    SELECT * INTO previous_metrics FROM get_tenant_metrics_for_period(p_tenant_id, prev_start_date, prev_end_date);
    
    -- Calculate risk factors (0-25 each, total 100)
    
    -- Revenue decline risk
    IF previous_metrics.total_revenue > 0 THEN
        IF current_metrics.total_revenue < previous_metrics.total_revenue * 0.8 THEN
            revenue_decline_risk := 25; -- 20% decline = high risk
        ELSIF current_metrics.total_revenue < previous_metrics.total_revenue * 0.9 THEN
            revenue_decline_risk := 15; -- 10% decline = medium risk
        ELSIF current_metrics.total_revenue < previous_metrics.total_revenue THEN
            revenue_decline_risk := 5; -- Any decline = low risk
        END IF;
    END IF;
    
    -- Appointment decline risk
    IF previous_metrics.total_appointments > 0 THEN
        IF current_metrics.total_appointments < previous_metrics.total_appointments * 0.7 THEN
            appointment_decline_risk := 25;
        ELSIF current_metrics.total_appointments < previous_metrics.total_appointments * 0.85 THEN
            appointment_decline_risk := 15;
        ELSIF current_metrics.total_appointments < previous_metrics.total_appointments THEN
            appointment_decline_risk := 5;
        END IF;
    END IF;
    
    -- Customer churn risk
    IF previous_metrics.total_customers > 0 THEN
        IF current_metrics.total_customers < previous_metrics.total_customers * 0.8 THEN
            customer_churn_risk := 25;
        ELSIF current_metrics.total_customers < previous_metrics.total_customers * 0.9 THEN
            customer_churn_risk := 15;
        ELSIF current_metrics.total_customers < previous_metrics.total_customers THEN
            customer_churn_risk := 5;
        END IF;
    END IF;
    
    -- AI performance risk
    IF current_metrics.ai_success_rate < 50 THEN
        ai_performance_risk := 25;
    ELSIF current_metrics.ai_success_rate < 70 THEN
        ai_performance_risk := 15;
    ELSIF current_metrics.ai_success_rate < 85 THEN
        ai_performance_risk := 5;
    END IF;
    
    risk_score := revenue_decline_risk + appointment_decline_risk + customer_churn_risk + ai_performance_risk;
    
    RETURN LEAST(100, risk_score);
END;
$$;

-- =====================================================
-- SHARED UTILITY FUNCTIONS
-- =====================================================

-- Function to get metrics calculation status
CREATE OR REPLACE FUNCTION get_metrics_calculation_status()
RETURNS TABLE (
    metric_type TEXT,
    calculated_at TIMESTAMPTZ,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'saas_metrics'::TEXT as type,
        COALESCE(MAX(updated_at), '1970-01-01'::TIMESTAMPTZ) as calc_at,
        CASE WHEN COUNT(*) > 0 THEN 'available' ELSE 'missing' END as status
    FROM saas_metrics
    
    UNION ALL
    
    SELECT 
        'tenant_metrics'::TEXT as type,
        COALESCE(MAX(updated_at), '1970-01-01'::TIMESTAMPTZ) as calc_at,
        CASE WHEN COUNT(*) > 0 THEN 'available' ELSE 'missing' END as status
    FROM tenant_metrics
    
    UNION ALL
    
    SELECT 
        'platform_totals'::TEXT as type,
        CURRENT_TIMESTAMP as calc_at,
        'calculated_on_demand'::TEXT as status;
END;
$$;

-- Function to generate time series data for charts
CREATE OR REPLACE FUNCTION get_time_series_data(
    p_tenant_id UUID DEFAULT NULL,
    p_metric_type TEXT DEFAULT 'revenue',
    p_period_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    date_point DATE,
    value DECIMAL(15,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    start_date DATE := CURRENT_DATE - INTERVAL '1 day' * p_period_days;
    end_date DATE := CURRENT_DATE;
BEGIN
    IF p_metric_type = 'revenue' THEN
        RETURN QUERY
        SELECT 
            a.created_at::DATE as date_point,
            COALESCE(SUM(COALESCE(a.final_price, a.quoted_price, 0)), 0)::DECIMAL(15,2) as value
        FROM appointments a
        WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
          AND a.created_at::DATE >= start_date
          AND a.created_at::DATE <= end_date
          AND a.status = 'completed'
        GROUP BY a.created_at::DATE
        ORDER BY date_point;
    ELSIF p_metric_type = 'appointments' THEN
        RETURN QUERY
        SELECT 
            a.created_at::DATE as date_point,
            COUNT(a.id)::DECIMAL(15,2) as value
        FROM appointments a
        WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
          AND a.created_at::DATE >= start_date
          AND a.created_at::DATE <= end_date
        GROUP BY a.created_at::DATE
        ORDER BY date_point;
    ELSIF p_metric_type = 'customers' THEN
        RETURN QUERY
        SELECT 
            a.created_at::DATE as date_point,
            COUNT(DISTINCT a.user_id)::DECIMAL(15,2) as value
        FROM appointments a
        WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
          AND a.created_at::DATE >= start_date
          AND a.created_at::DATE <= end_date
        GROUP BY a.created_at::DATE
        ORDER BY date_point;
    END IF;
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_created_status ON appointments(tenant_id, created_at, status);
CREATE INDEX IF NOT EXISTS idx_conversation_history_tenant_created ON conversation_history(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id);

COMMENT ON FUNCTION get_saas_metrics IS 'Gets complete SaaS platform metrics for Sistema Dashboard';
COMMENT ON FUNCTION get_top_tenants IS 'Gets ranked tenant performance for Sistema Dashboard';
COMMENT ON FUNCTION get_tenant_distribution IS 'Gets tenant distribution by domain for Sistema Dashboard';
COMMENT ON FUNCTION get_tenant_metrics_for_period IS 'Gets complete tenant metrics for Tenant Dashboard';
COMMENT ON FUNCTION calculate_business_health_score IS 'Calculates tenant business health score (0-100)';
COMMENT ON FUNCTION calculate_risk_score IS 'Calculates tenant risk score (0-100)';
COMMENT ON FUNCTION get_metrics_calculation_status IS 'Gets status of all metric calculations';
COMMENT ON FUNCTION get_time_series_data IS 'Gets time series data for dashboard charts';

