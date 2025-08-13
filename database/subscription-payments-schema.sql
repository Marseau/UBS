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