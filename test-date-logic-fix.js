require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDateLogicFix() {
  try {
    console.log('🎯 TESTING DATE LOGIC DIFFERENCE between original and v7.0\n');
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    const tenant = tenants[0];
    console.log(`Testing with: ${tenant.business_name} ${tenant.id.substring(0, 8)}\n`);
    
    const testDate = new Date().toISOString().split('T')[0]; // Today
    console.log(`Test date: ${testDate}\n`);
    
    // Test date calculations for 30d period
    console.log('📅 COMPARING DATE CALCULATIONS:');
    console.log('==================================');
    
    // Original method (works): INTERVAL
    console.log('🟢 ORIGINAL method (works):');
    console.log(`   v_start_date := '${testDate}'::date - INTERVAL '1 day' * 30;`);
    console.log(`   v_end_date := '${testDate}'::date;`);
    console.log(`   WHERE start_time >= v_start_date AND start_time <= v_end_date`);
    
    // Calculate original dates
    const originalStartSQL = `SELECT '${testDate}'::date - INTERVAL '1 day' * 30 as start_date`;
    const { data: originalStart } = await client.rpc('exec_raw_sql', { sql: originalStartSQL });
    console.log(`   Result: ${originalStart?.[0]?.start_date} to ${testDate}`);
    
    console.log('\n🔴 v7.0 method (fails):');
    console.log(`   v_start_date := '${testDate}'::date - (30 - 1);`);
    console.log(`   v_end_date := '${testDate}'::date;`);
    console.log(`   WHERE start_time >= v_start_date::timestamptz AND start_time < (v_end_date + 1)::timestamptz`);
    
    // Calculate v7.0 dates
    const v7StartSQL = `SELECT '${testDate}'::date - (30 - 1) as start_date`;
    const { data: v7Start } = await client.rpc('exec_raw_sql', { sql: v7StartSQL });
    console.log(`   Result: ${v7Start?.[0]?.start_date} to ${testDate}`);
    
    // Count appointments for both methods
    console.log('\n🔍 APPOINTMENT COUNT COMPARISON:');
    console.log('=====================================');
    
    // Original method count
    const originalCountSQL = `
      SELECT COUNT(*) as count
      FROM appointments 
      WHERE tenant_id = '${tenant.id}'
        AND start_time >= ('${testDate}'::date - INTERVAL '1 day' * 30)
        AND start_time <= '${testDate}'::date
    `;
    
    const { data: originalCount } = await client.rpc('exec_raw_sql', { sql: originalCountSQL });
    console.log(`🟢 Original method finds: ${originalCount?.[0]?.count || 0} appointments`);
    
    // v7.0 method count  
    const v7CountSQL = `
      SELECT COUNT(*) as count
      FROM appointments 
      WHERE tenant_id = '${tenant.id}'
        AND start_time >= ('${testDate}'::date - (30 - 1))::timestamptz
        AND start_time < (('${testDate}'::date + 1))::timestamptz
    `;
    
    const { data: v7Count } = await client.rpc('exec_raw_sql', { sql: v7CountSQL });
    console.log(`🔴 v7.0 method finds: ${v7Count?.[0]?.count || 0} appointments`);
    
    const originalAppointments = originalCount?.[0]?.count || 0;
    const v7Appointments = v7Count?.[0]?.count || 0;
    
    if (originalAppointments === 0 && v7Appointments === 0) {
      console.log('\n⚠️ Both methods return 0 appointments for this tenant.');
      console.log('This means the date logic difference is not the root cause.');
      console.log('The issue is likely in the JSONB building or store_tenant_metric call context.');
    } else if (originalAppointments !== v7Appointments) {
      console.log('\n🎯 FOUND THE DIFFERENCE!');
      console.log(`Original finds ${originalAppointments} vs v7.0 finds ${v7Appointments}`);
      console.log('This date logic difference could cause different JSONB content!');
    } else {
      console.log('\n✅ Both methods find the same number of appointments.');
      console.log('Date logic is NOT the issue. Problem must be elsewhere.');
    }
    
    // Test if we can create a minimal working version with original date logic
    console.log('\n🧪 CREATING MINIMAL TEST with ORIGINAL date logic...');
    
    const minimalTestSQL = `
DROP FUNCTION IF EXISTS test_original_date_logic(uuid);

CREATE OR REPLACE FUNCTION test_original_date_logic(p_tenant_id uuid)
RETURNS json AS $$
DECLARE
    v_tenant_record RECORD;
    v_period_days INTEGER := 30;
    v_start_date DATE;
    v_end_date DATE;
    v_tenant_revenue DECIMAL(15,2) := 0;
    v_tenant_appointments INTEGER := 0;
    v_comprehensive_metrics JSONB;
BEGIN
    SELECT id, business_name INTO v_tenant_record
    FROM tenants WHERE id = p_tenant_id AND status = 'active';
    
    -- ORIGINAL date calculation method
    v_end_date := CURRENT_DATE;
    v_start_date := CURRENT_DATE - INTERVAL '1 day' * v_period_days;
    
    RAISE NOTICE 'Using ORIGINAL date method: % to %', v_start_date, v_end_date;
    
    -- Get data using ORIGINAL where clause
    SELECT 
        COALESCE(SUM(COALESCE(quoted_price, final_price, 0)), 0),
        COUNT(*)
    INTO v_tenant_revenue, v_tenant_appointments
    FROM appointments 
    WHERE tenant_id = v_tenant_record.id
      AND start_time >= v_start_date 
      AND start_time <= v_end_date;
    
    RAISE NOTICE 'Found: Revenue=%, Appointments=%', v_tenant_revenue, v_tenant_appointments;
    
    -- Simple metrics
    v_comprehensive_metrics := jsonb_build_object(
        'financial_metrics', jsonb_build_object(
            'tenant_revenue', v_tenant_revenue
        ),
        'appointment_metrics', jsonb_build_object(
            'appointments_total', v_tenant_appointments
        ),
        'metadata', jsonb_build_object(
            'method', 'ORIGINAL_DATE_LOGIC',
            'start_date', v_start_date,
            'end_date', v_end_date
        )
    );
    
    -- NO EXCEPTION HANDLING - see if this works
    PERFORM store_tenant_metric(
        v_tenant_record.id,
        'comprehensive',
        v_comprehensive_metrics,
        '30d'
    );
    
    RETURN json_build_object('success', true, 'method', 'original_date_logic');
END;
$$ LANGUAGE plpgsql;
`;
    
    console.log('Deploying minimal test with original date logic...');
    
    // This will fail because there's no exec_raw_sql, but shows the concept
    console.log('\n📝 Next steps:');
    console.log('1. Apply the minimal test function to database');
    console.log('2. Run it and see if original date logic fixes the issue');
    console.log('3. If it works, update v7.0 to use original date logic');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testDateLogicFix();