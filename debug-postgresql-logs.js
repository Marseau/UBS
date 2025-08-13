require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugPostgreSQLLogs() {
  try {
    console.log('🔍 DEBUGGING PostgreSQL logs to find why v7.0 store_tenant_metric calls fail\n');
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    const tenant = tenants[0];
    console.log(`Testing with: ${tenant.business_name} ${tenant.id.substring(0, 8)}\n`);
    
    // Clear table
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // CREATE a simple version without exception handling to see raw errors
    console.log('🚀 Creating a NO EXCEPTION v7.0 to see RAW PostgreSQL errors...\n');
    
    const createNoExceptionSQL = `
DROP FUNCTION IF EXISTS calculate_tenant_metrics_no_exception_debug(date, uuid);

CREATE OR REPLACE FUNCTION calculate_tenant_metrics_no_exception_debug(
    p_calculation_date date DEFAULT CURRENT_DATE,
    p_tenant_id uuid DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_period_days INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_tenant_revenue DECIMAL(15,2) := 0;
    v_tenant_appointments INTEGER := 0;
    v_tenant_customers INTEGER := 0;
    v_comprehensive_metrics JSONB;
    
BEGIN
    RAISE NOTICE '🔍 NO EXCEPTION DEBUG: Starting for tenant %', p_tenant_id;
    
    SELECT id, business_name INTO v_tenant_record
    FROM tenants 
    WHERE id = p_tenant_id AND status = 'active';
    
    -- Test just ONE period (30d) to isolate the issue
    v_period_days := 30;
    v_start_date := p_calculation_date - (v_period_days - 1);
    v_end_date := p_calculation_date;
    
    RAISE NOTICE '📅 Processing period %d: % to %', v_period_days, v_start_date, v_end_date;
    
    -- Get basic data 
    SELECT 
        COALESCE(SUM(COALESCE(quoted_price, final_price, 0)), 0),
        COUNT(*),
        COUNT(DISTINCT customer_id)
    INTO v_tenant_revenue, v_tenant_appointments, v_tenant_customers
    FROM appointments 
    WHERE tenant_id = v_tenant_record.id
      AND start_time >= v_start_date::timestamptz
      AND start_time < (v_end_date + 1)::timestamptz;
    
    RAISE NOTICE '💰 Basic data: Revenue=%, Appointments=%, Customers=%', 
        v_tenant_revenue, v_tenant_appointments, v_tenant_customers;
    
    -- Build simple metrics (not all 73)
    v_comprehensive_metrics := jsonb_build_object(
        'financial_metrics', jsonb_build_object(
            'tenant_revenue', v_tenant_revenue,
            'avg_ticket', CASE WHEN v_tenant_appointments > 0 THEN (v_tenant_revenue / v_tenant_appointments) ELSE 0 END
        ),
        'appointment_metrics', jsonb_build_object(
            'appointments_total', v_tenant_appointments
        ),
        'customer_metrics', jsonb_build_object(
            'customers_total', v_tenant_customers
        ),
        'metadata', jsonb_build_object(
            'calculation_date', p_calculation_date,
            'period_days', v_period_days,
            'version', 'NO_EXCEPTION_DEBUG'
        )
    );
    
    RAISE NOTICE '📦 Built JSONB metrics: %', v_comprehensive_metrics::text;
    RAISE NOTICE '🎯 About to call store_tenant_metric with:';
    RAISE NOTICE '   - tenant_id: %', v_tenant_record.id;
    RAISE NOTICE '   - metric_type: comprehensive';
    RAISE NOTICE '   - period: %d', v_period_days || 'd';
    RAISE NOTICE '   - jsonb size: % chars', LENGTH(v_comprehensive_metrics::text);
    
    -- NO EXCEPTION HANDLING - Let PostgreSQL show us the real error
    PERFORM store_tenant_metric(
        v_tenant_record.id,
        'comprehensive',
        v_comprehensive_metrics,
        v_period_days || 'd'
    );
    
    RAISE NOTICE '✅ store_tenant_metric call completed successfully!';
    
    RETURN json_build_object(
        'success', true,
        'message', 'NO_EXCEPTION_DEBUG completed',
        'tenant_id', v_tenant_record.id,
        'metrics_attempted', 1
    );
    
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_tenant_metrics_no_exception_debug(date, uuid) TO authenticated;
`;
    
    // Deploy the function
    const { error: createError } = await client.rpc('exec', {
      query: createNoExceptionSQL
    });
    
    if (createError) {
      console.log('❌ Error creating debug function:', createError);
      return;
    }
    
    console.log('✅ Created no-exception debug function\n');
    
    // Run it and see what happens
    console.log('🚀 Running NO EXCEPTION debug procedure...\n');
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_no_exception_debug', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    if (error) {
      console.log('🎯 CAUGHT THE REAL ERROR!');
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);
      console.log('Error details:', error.details);
      console.log('Error hint:', error.hint);
    } else {
      console.log('Result:', result);
      
      // Check if record was stored
      const { count } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      
      console.log(`Records stored: ${count}`);
      
      if (count === 1) {
        console.log('🎉 SUCCESS! The simplified version works!');
        console.log('This means the issue is in the COMPLEX JSONB building in v7.0');
      } else {
        console.log('❌ Even simplified version fails - deeper PostgreSQL issue');
      }
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugPostgreSQLLogs();