-- Database functions and tables for metrics system
-- Execute this SQL directly in Supabase SQL editor

-- 1. Platform totals function
CREATE OR REPLACE FUNCTION get_platform_totals(start_date DATE, end_date DATE)
RETURNS TABLE (
    total_tenants INTEGER,
    active_tenants INTEGER,
    total_revenue DECIMAL(15,2),
    total_appointments INTEGER,
    total_customers INTEGER,
    total_conversations INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT t.id)::INTEGER as total_tenants,
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END)::INTEGER as active_tenants,
        -- Revenue from completed appointments
        COALESCE(SUM(CASE WHEN a.status = 'completed' AND a.final_price IS NOT NULL 
                         THEN a.final_price::DECIMAL(15,2) 
                         ELSE 0 END), 0) as total_revenue,
        COUNT(DISTINCT a.id)::INTEGER as total_appointments,
        COUNT(DISTINCT u.id)::INTEGER as total_customers,
        COUNT(DISTINCT ch.id)::INTEGER as total_conversations
    FROM tenants t
    LEFT JOIN appointments a ON t.id = a.tenant_id 
        AND a.created_at >= start_date 
        AND a.created_at <= end_date + INTERVAL '1 day'
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id 
        AND ch.created_at >= start_date 
        AND ch.created_at <= end_date + INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- 2. Tenant metrics function
CREATE OR REPLACE FUNCTION get_tenant_metrics_for_period(tenant_id UUID, start_date DATE, end_date DATE)
RETURNS TABLE (
    total_appointments INTEGER,
    completed_appointments INTEGER,
    cancelled_appointments INTEGER,
    pending_appointments INTEGER,
    total_revenue DECIMAL(15,2),
    total_customers INTEGER,
    total_conversations INTEGER,
    avg_response_time DECIMAL(8,2),
    conversion_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT a.id)::INTEGER as total_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END)::INTEGER as completed_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.id END)::INTEGER as cancelled_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'pending' THEN a.id END)::INTEGER as pending_appointments,
        COALESCE(SUM(CASE WHEN a.status = 'completed' AND a.final_price IS NOT NULL 
                         THEN a.final_price::DECIMAL(15,2) 
                         ELSE 0 END), 0) as total_revenue,
        COUNT(DISTINCT a.user_id)::INTEGER as total_customers,
        COUNT(DISTINCT ch.id)::INTEGER as total_conversations,
        COALESCE(AVG(ch.response_time), 0)::DECIMAL(8,2) as avg_response_time,
        CASE 
            WHEN COUNT(DISTINCT ch.id) > 0 
            THEN (COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END)::DECIMAL / COUNT(DISTINCT ch.id)::DECIMAL * 100)
            ELSE 0 
        END as conversion_rate
    FROM appointments a
    LEFT JOIN conversation_history ch ON a.tenant_id = ch.tenant_id
        AND ch.created_at >= start_date 
        AND ch.created_at <= end_date + INTERVAL '1 day'
    WHERE a.tenant_id = $1
        AND a.created_at >= start_date 
        AND a.created_at <= end_date + INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- 3. Platform metrics tables
CREATE TABLE IF NOT EXISTS platform_metrics_7d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(calculation_date)
);

CREATE TABLE IF NOT EXISTS platform_metrics_30d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(calculation_date)
);

CREATE TABLE IF NOT EXISTS platform_metrics_90d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(calculation_date)
);

CREATE TABLE IF NOT EXISTS platform_metrics_1y (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(calculation_date)
);

-- 4. Tenant metrics tables
CREATE TABLE IF NOT EXISTS tenant_metrics_7d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    total_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, calculation_date)
);

CREATE TABLE IF NOT EXISTS tenant_metrics_30d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    total_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, calculation_date)
);

CREATE TABLE IF NOT EXISTS tenant_metrics_90d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    total_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, calculation_date)
);

CREATE TABLE IF NOT EXISTS tenant_metrics_1y (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    total_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, calculation_date)
);

-- 5. Enable RLS on all tables
ALTER TABLE platform_metrics_7d ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metrics_30d ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metrics_90d ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metrics_1y ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metrics_7d ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metrics_30d ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metrics_90d ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_metrics_1y ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for super admin access
CREATE POLICY "Super admin full access" ON platform_metrics_7d FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON platform_metrics_30d FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON platform_metrics_90d FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON platform_metrics_1y FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON tenant_metrics_7d FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON tenant_metrics_30d FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON tenant_metrics_90d FOR ALL TO authenticated USING (true);
CREATE POLICY "Super admin full access" ON tenant_metrics_1y FOR ALL TO authenticated USING (true);

-- 7. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_platform_metrics_7d_date ON platform_metrics_7d(calculation_date);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_30d_date ON platform_metrics_30d(calculation_date);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_90d_date ON platform_metrics_90d(calculation_date);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_1y_date ON platform_metrics_1y(calculation_date);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_7d_tenant_date ON tenant_metrics_7d(tenant_id, calculation_date);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_30d_tenant_date ON tenant_metrics_30d(tenant_id, calculation_date);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_90d_tenant_date ON tenant_metrics_90d(tenant_id, calculation_date);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_1y_tenant_date ON tenant_metrics_1y(tenant_id, calculation_date);