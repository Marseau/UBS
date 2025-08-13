-- Drop existing functions that might conflict
-- Execute this BEFORE the other SQL files

-- Drop functions that might have different return types
DROP FUNCTION IF EXISTS get_metrics_calculation_status();
DROP FUNCTION IF EXISTS get_saas_metrics();
DROP FUNCTION IF EXISTS get_saas_metrics(DATE, DATE);
DROP FUNCTION IF EXISTS get_tenant_real_revenue_only(UUID);
DROP FUNCTION IF EXISTS get_tenant_participation(UUID, INTEGER);
DROP FUNCTION IF EXISTS calculate_platform_mrr();
DROP FUNCTION IF EXISTS get_platform_revenue_summary(INTEGER);
DROP FUNCTION IF EXISTS get_top_tenants(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_tenant_distribution();
DROP FUNCTION IF EXISTS get_growth_metrics(INTEGER);
DROP FUNCTION IF EXISTS get_risk_tenants(INTEGER);
DROP FUNCTION IF EXISTS calculate_risk_score(UUID, TEXT);
DROP FUNCTION IF EXISTS get_tenant_metrics_for_period(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS calculate_business_health_score(UUID);

-- Drop any tables that might have conflicts
DROP TABLE IF EXISTS saas_metrics CASCADE;
DROP TABLE IF EXISTS top_tenants CASCADE;
DROP TABLE IF EXISTS tenant_distribution CASCADE;
DROP TABLE IF EXISTS growth_metrics CASCADE;
DROP TABLE IF EXISTS tenant_risk_scores CASCADE;
DROP TABLE IF EXISTS tenant_metrics CASCADE;

-- Also clean up subscription_payments table if it exists
DROP TABLE IF EXISTS subscription_payments CASCADE;

-- Drop any existing policies that might conflict
-- (This will be recreated by the schema files)