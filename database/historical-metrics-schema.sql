-- Historical Metrics Schema for Multi-Period Analytics
-- This schema creates tables to store pre-aggregated metrics for different time periods
-- Updated once daily via cron jobs to feed dashboard efficiently

-- Tenant metrics aggregated by period
CREATE TABLE tenant_metrics_aggregated (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('7d', '30d', '90d', '1y')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Appointment metrics
    total_appointments INTEGER DEFAULT 0,
    confirmed_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    pending_appointments INTEGER DEFAULT 0,
    appointments_growth_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Revenue metrics
    total_revenue DECIMAL(15,2) DEFAULT 0,
    revenue_growth_rate DECIMAL(5,2) DEFAULT 0,
    average_value DECIMAL(15,2) DEFAULT 0,
    
    -- Customer metrics
    total_customers INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    returning_customers INTEGER DEFAULT 0,
    customer_growth_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Service metrics
    total_services INTEGER DEFAULT 0,
    most_popular_service VARCHAR(255),
    service_utilization_rate DECIMAL(5,2) DEFAULT 0,
    
    -- AI metrics
    total_conversations INTEGER DEFAULT 0,
    ai_success_rate DECIMAL(5,2) DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    
    -- Conversion metrics
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    booking_conversion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Platform participation
    revenue_platform_percentage DECIMAL(5,2) DEFAULT 0,
    appointments_platform_percentage DECIMAL(5,2) DEFAULT 0,
    customers_platform_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Business health
    business_health_score INTEGER DEFAULT 0,
    risk_level VARCHAR(50) DEFAULT 'Baixo Risco',
    risk_score INTEGER DEFAULT 0,
    
    -- Ranking
    revenue_rank INTEGER DEFAULT 0,
    appointments_rank INTEGER DEFAULT 0,
    customers_rank INTEGER DEFAULT 0,
    overall_rank INTEGER DEFAULT 0,
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, period_type, period_start)
);

-- Historical time series data for charts
CREATE TABLE tenant_metrics_timeseries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('7d', '30d', '90d', '1y')),
    date_point DATE NOT NULL,
    
    -- Daily metrics
    daily_revenue DECIMAL(15,2) DEFAULT 0,
    daily_appointments INTEGER DEFAULT 0,
    daily_customers INTEGER DEFAULT 0,
    daily_conversations INTEGER DEFAULT 0,
    
    -- Service breakdown
    service_breakdown JSONB DEFAULT '{}',
    
    -- Platform context
    platform_daily_revenue DECIMAL(15,2) DEFAULT 0,
    platform_daily_appointments INTEGER DEFAULT 0,
    platform_daily_customers INTEGER DEFAULT 0,
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, period_type, date_point)
);

-- Platform-wide metrics aggregated by period
CREATE TABLE platform_metrics_aggregated (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('7d', '30d', '90d', '1y')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Platform totals
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    
    -- Platform performance
    platform_growth_rate DECIMAL(5,2) DEFAULT 0,
    platform_health_score INTEGER DEFAULT 0,
    
    -- Domain distribution
    domain_distribution JSONB DEFAULT '{}',
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(period_type, period_start)
);

-- Risk assessment historical data
CREATE TABLE tenant_risk_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assessment_date DATE NOT NULL,
    
    -- Risk factors
    revenue_decline_risk INTEGER DEFAULT 0,
    appointment_cancellation_risk INTEGER DEFAULT 0,
    customer_churn_risk INTEGER DEFAULT 0,
    ai_performance_risk INTEGER DEFAULT 0,
    
    -- Overall risk
    overall_risk_score INTEGER DEFAULT 0,
    risk_level VARCHAR(50) DEFAULT 'Baixo Risco',
    risk_factors JSONB DEFAULT '{}',
    
    -- Recommendations
    recommendations TEXT[],
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, assessment_date)
);

-- Service performance metrics
CREATE TABLE service_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('7d', '30d', '90d', '1y')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Service metrics
    total_bookings INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Platform participation
    platform_service_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tenant_id, service_id, period_type, period_start)
);

-- Indexes for performance
CREATE INDEX idx_tenant_metrics_aggregated_tenant_period ON tenant_metrics_aggregated(tenant_id, period_type, period_start);
CREATE INDEX idx_tenant_metrics_aggregated_period ON tenant_metrics_aggregated(period_type, period_start);
CREATE INDEX idx_tenant_metrics_timeseries_tenant_period ON tenant_metrics_timeseries(tenant_id, period_type, date_point);
CREATE INDEX idx_platform_metrics_aggregated_period ON platform_metrics_aggregated(period_type, period_start);
CREATE INDEX idx_tenant_risk_history_tenant_date ON tenant_risk_history(tenant_id, assessment_date);
CREATE INDEX idx_service_performance_tenant_period ON service_performance_metrics(tenant_id, period_type, period_start);

-- Function to calculate business health score
CREATE OR REPLACE FUNCTION calculate_business_health_score(
    p_tenant_id UUID,
    p_period_type VARCHAR(10) DEFAULT '30d'
) RETURNS INTEGER AS $$
DECLARE
    health_score INTEGER := 0;
    revenue_score INTEGER := 0;
    appointment_score INTEGER := 0;
    customer_score INTEGER := 0;
    ai_score INTEGER := 0;
    growth_score INTEGER := 0;
BEGIN
    -- Get current metrics
    SELECT 
        CASE 
            WHEN total_revenue >= 10000 THEN 25
            WHEN total_revenue >= 5000 THEN 20
            WHEN total_revenue >= 1000 THEN 15
            WHEN total_revenue >= 500 THEN 10
            ELSE 5
        END,
        CASE 
            WHEN total_appointments >= 100 THEN 20
            WHEN total_appointments >= 50 THEN 15
            WHEN total_appointments >= 20 THEN 10
            WHEN total_appointments >= 10 THEN 5
            ELSE 0
        END,
        CASE 
            WHEN total_customers >= 50 THEN 20
            WHEN total_customers >= 25 THEN 15
            WHEN total_customers >= 10 THEN 10
            WHEN total_customers >= 5 THEN 5
            ELSE 0
        END,
        CASE 
            WHEN ai_success_rate >= 90 THEN 15
            WHEN ai_success_rate >= 80 THEN 12
            WHEN ai_success_rate >= 70 THEN 8
            WHEN ai_success_rate >= 60 THEN 5
            ELSE 0
        END,
        CASE 
            WHEN revenue_growth_rate >= 20 THEN 20
            WHEN revenue_growth_rate >= 10 THEN 15
            WHEN revenue_growth_rate >= 5 THEN 10
            WHEN revenue_growth_rate >= 0 THEN 5
            ELSE 0
        END
    INTO revenue_score, appointment_score, customer_score, ai_score, growth_score
    FROM tenant_metrics_aggregated 
    WHERE tenant_id = p_tenant_id 
    AND period_type = p_period_type 
    AND period_start = (
        SELECT MAX(period_start) 
        FROM tenant_metrics_aggregated 
        WHERE tenant_id = p_tenant_id AND period_type = p_period_type
    );
    
    health_score := COALESCE(revenue_score, 0) + COALESCE(appointment_score, 0) + 
                   COALESCE(customer_score, 0) + COALESCE(ai_score, 0) + COALESCE(growth_score, 0);
    
    RETURN LEAST(health_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate risk score as external_sync percentage
CREATE OR REPLACE FUNCTION calculate_risk_score(
    p_tenant_id UUID,
    p_period_type VARCHAR(10) DEFAULT '30d'
) RETURNS DECIMAL AS $$
DECLARE
    total_appointments INTEGER := 0;
    external_sync_appointments INTEGER := 0;
    external_sync_percentage DECIMAL := 0;
    start_date DATE;
    end_date DATE;
BEGIN
    -- Calculate period dates
    end_date := CURRENT_DATE;
    CASE p_period_type
        WHEN '7d' THEN start_date := CURRENT_DATE - INTERVAL '7 days';
        WHEN '30d' THEN start_date := CURRENT_DATE - INTERVAL '30 days';
        WHEN '90d' THEN start_date := CURRENT_DATE - INTERVAL '90 days';
        ELSE start_date := CURRENT_DATE - INTERVAL '30 days';
    END CASE;
    
    -- Count total appointments in period (using start_time)
    SELECT COUNT(*)::INTEGER 
    INTO total_appointments
    FROM appointments a 
    WHERE a.tenant_id = p_tenant_id
    AND a.start_time >= (start_date::timestamp)
    AND a.start_time <= (CURRENT_DATE::timestamp);
    
    -- Count external_sync appointments in period
    SELECT COUNT(*)::INTEGER 
    INTO external_sync_appointments
    FROM appointments a 
    WHERE a.tenant_id = p_tenant_id
    AND a.start_time >= (start_date::timestamp)
    AND a.start_time <= (CURRENT_DATE::timestamp)
    AND a.appointment_data->>'booking_method' = 'external_sync';
    
    -- Calculate percentage
    IF total_appointments > 0 THEN
        external_sync_percentage := (external_sync_appointments::DECIMAL / total_appointments) * 100;
    ELSE
        external_sync_percentage := 0;
    END IF;
    
    RETURN external_sync_percentage;
END;
$$ LANGUAGE plpgsql;

-- Function to get risk level from score
CREATE OR REPLACE FUNCTION get_risk_level(risk_score INTEGER) RETURNS VARCHAR(50) AS $$
BEGIN
    CASE 
        WHEN risk_score >= 80 THEN RETURN 'Alto Risco';
        WHEN risk_score >= 60 THEN RETURN 'Risco Médio';
        WHEN risk_score >= 40 THEN RETURN 'Baixo Risco';
        ELSE RETURN 'Saudável';
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE tenant_metrics_aggregated IS 'Pre-aggregated tenant metrics for different time periods, updated daily by cron jobs';
COMMENT ON TABLE tenant_metrics_timeseries IS 'Historical time series data for charts, updated daily by cron jobs';
COMMENT ON TABLE platform_metrics_aggregated IS 'Platform-wide metrics aggregated by period, updated daily by cron jobs';
COMMENT ON TABLE tenant_risk_history IS 'Historical risk assessment data for tenants';
COMMENT ON TABLE service_performance_metrics IS 'Service-level performance metrics aggregated by period';