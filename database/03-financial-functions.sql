-- =====================================================
-- Universal Booking System - Financial Functions
-- =====================================================
-- This script adds financial calculation functions to the database.
-- It should be applied after the main schema (00) and RLS (01).

-- Function to calculate Monthly Recurring Revenue (MRR)
-- =====================================================
-- This function calculates the total monthly recurring revenue from active subscriptions.
-- It uses a CASE statement to determine the price based on the plan_id stored
-- in the stripe_customers table. This can be customized with actual plan prices.

CREATE OR REPLACE FUNCTION public.calculate_mrr()
RETURNS numeric AS $$
DECLARE
    total_mrr numeric;
BEGIN
    SELECT COALESCE(SUM(
        CASE
            -- NOTE: These plan_ids and prices are examples.
            -- Replace with your actual Stripe plan IDs and prices.
            WHEN sc.plan_id = 'pro' THEN 99.00
            WHEN sc.plan_id = 'business' THEN 249.00
            WHEN sc.plan_id = 'basic' THEN 49.00
            ELSE 0 -- or a default value for unknown active plans
        END
    ), 0)
    INTO total_mrr
    FROM public.stripe_customers sc
    WHERE sc.subscription_status = 'active';

    RETURN total_mrr;
END;
$$ LANGUAGE plpgsql;

-- Example of how to grant usage if needed, assuming a service role
-- GRANT EXECUTE ON FUNCTION public.calculate_mrr() TO service_role;

-- Function to get top N tenants by revenue
-- =====================================================
-- This function identifies the top tenants based on their calculated monthly revenue.
-- It joins tenants with their Stripe customer data to perform the calculation.

CREATE OR REPLACE FUNCTION public.get_top_tenants_by_revenue(limit_count integer)
RETURNS TABLE(id uuid, name text, revenue numeric) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        COALESCE(SUM(
            CASE
                WHEN sc.plan_id = 'pro' THEN 99.00
                WHEN sc.plan_id = 'business' THEN 249.00
                WHEN sc.plan_id = 'basic' THEN 49.00
                ELSE 0
            END
        ), 0) AS total_revenue
    FROM
        public.tenants t
    JOIN
        public.stripe_customers sc ON t.id = sc.tenant_id
    WHERE
        sc.subscription_status = 'active'
    GROUP BY
        t.id, t.name
    ORDER BY
        total_revenue DESC
    LIMIT
        limit_count;
END;
$$ LANGUAGE plpgsql;

-- Log completion
SELECT 'Financial functions created successfully.'; 