-- Fix platform_metrics table schema and populate data
-- Based on the actual procedure in database/platform-metrics-aggregation-procedure.sql

-- Ensure platform_metrics table exists with proper structure
CREATE TABLE IF NOT EXISTS platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_date DATE NOT NULL,
    period VARCHAR(10) NOT NULL, -- '7d', '30d', '90d'
    
    -- Core platform MRR (from tenant subscription costs)
    platform_mrr DECIMAL(15,2) DEFAULT 0,
    
    -- Aggregated operational metrics
    total_tenants_processed INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_ai_interactions INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    
    -- Average performance metrics (weighted)
    avg_appointment_success_rate DECIMAL(5,2) DEFAULT 0,
    avg_conversion_rate DECIMAL(5,2) DEFAULT 0,
    avg_customer_satisfaction_score DECIMAL(3,1) DEFAULT 0,
    avg_health_score INTEGER DEFAULT 0,
    
    -- Cost and profitability metrics  
    total_platform_costs DECIMAL(15,2) DEFAULT 0,
    total_platform_margin DECIMAL(15,2) DEFAULT 0,
    avg_margin_percentage DECIMAL(5,2) DEFAULT 0,
    profitable_tenants_count INTEGER DEFAULT 0,
    
    -- Metadata
    data_source VARCHAR(100) DEFAULT 'tenant_metrics_aggregation',
    aggregation_method VARCHAR(50) DEFAULT 'sum_and_weighted_average',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint per date/period
    UNIQUE(calculation_date, period)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_metrics_date_period ON platform_metrics(calculation_date, period);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_created_at ON platform_metrics(created_at);

-- Populate with sample data for testing
INSERT INTO platform_metrics (
    calculation_date, period, platform_mrr, total_tenants_processed, active_tenants,
    total_revenue, total_appointments, total_conversations, data_source
) VALUES 
    (CURRENT_DATE, '7d', 0, 10, 5, 5000.00, 50, 150, 'manual_fix'),
    (CURRENT_DATE, '30d', 580.00, 10, 5, 25000.00, 200, 800, 'manual_fix'),
    (CURRENT_DATE, '90d', 928.00, 10, 10, 87237.14, 819, 2500, 'manual_fix')
ON CONFLICT (calculation_date, period) 
DO UPDATE SET 
    platform_mrr = EXCLUDED.platform_mrr,
    total_tenants_processed = EXCLUDED.total_tenants_processed,
    active_tenants = EXCLUDED.active_tenants,
    total_revenue = EXCLUDED.total_revenue,
    total_appointments = EXCLUDED.total_appointments,
    total_conversations = EXCLUDED.total_conversations,
    data_source = EXCLUDED.data_source,
    updated_at = NOW();

-- Verify the data was inserted
SELECT 
    period, 
    platform_mrr, 
    active_tenants, 
    total_revenue, 
    total_appointments,
    total_conversations,
    data_source,
    calculation_date
FROM platform_metrics 
ORDER BY period;