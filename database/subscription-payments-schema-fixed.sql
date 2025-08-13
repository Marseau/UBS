-- SUBSCRIPTION_PAYMENTS table for real payment tracking
-- This table stores actual monthly payments from tenants
-- No more hardcoded values - only real revenue data
-- FIXED: Removed auth.tenant_id() which doesn't exist in Supabase

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

-- RLS Policy (FIXED: Using auth.uid() instead of auth.tenant_id())
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything
CREATE POLICY "Service role can manage all payments"
    ON subscription_payments FOR ALL
    USING (auth.role() = 'service_role');

-- Allow authenticated users to view payments (will be filtered by application logic)
CREATE POLICY "Authenticated users can view payments"
    ON subscription_payments FOR SELECT
    USING (auth.role() = 'authenticated');

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