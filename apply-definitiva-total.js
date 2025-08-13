const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyDefinitivaTotal() {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection with a simple query
    const { data, error } = await client.from('tenants').select('id').limit(1);
    
    if (error) {
      console.log('Database connection failed:', error);
      process.exit(1);
    }
    
    console.log('✓ Database connection successful');
    
    // Try to test if the DEFINITIVA TOTAL function exists
    console.log('Testing if DEFINITIVA TOTAL function exists...');
    
    try {
      const { data: testData, error: testError } = await client.rpc('calculate_tenant_metrics_definitiva_total_fixed', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: null
      });
      
      if (testError) {
        if (testError.message.includes('does not exist') || testError.code === 'PGRST202') {
          console.log('❌ DEFINITIVA TOTAL function does not exist');
          console.log('');
          console.log('NEXT STEPS:');
          console.log('1. Open Supabase Dashboard → SQL Editor');
          console.log('2. Copy the contents of database/DEFINITIVA-TOTAL-FIXED-ALL-ISSUES.sql');
          console.log('3. Execute the SQL to create the function');
          console.log('4. Return here to test the system');
          console.log('');
          console.log('File location: ./database/DEFINITIVA-TOTAL-FIXED-ALL-ISSUES.sql');
          console.log('This file contains all 6 critical fixes applied.');
        } else {
          console.log('⚠️ Function exists but execution issues:', testError.message);
          console.log('This may be expected if there are no active tenants.');
        }
      } else {
        console.log('✅ DEFINITIVA TOTAL function executed successfully!');
        console.log('Result:', {
          success: testData?.success,
          processed_tenants: testData?.processed_tenants,
          periods_processed: testData?.periods_processed,
          total_metrics_created: testData?.total_metrics_created,
          version: testData?.version
        });
      }
    } catch (err) {
      console.log('❌ Function test failed:', err.message);
    }
    
    // Also test the optimized cron service
    console.log('');
    console.log('Testing optimized cron service...');
    try {
      const { data: cronData, error: cronError } = await client.rpc('calculate_tenant_metrics_definitiva_total', {
        p_calculation_date: new Date().toISOString().split('T')[0],
        p_tenant_id: null
      });
      
      if (cronError) {
        if (cronError.message.includes('does not exist')) {
          console.log('⚠️ Original procedure also missing - system needs both procedures');
        } else {
          console.log('⚠️ Original procedure exists but has issues:', cronError.message);
        }
      } else {
        console.log('✓ Original procedure also working:', {
          success: cronData?.success,
          version: cronData?.version
        });
      }
    } catch (err) {
      console.log('Original procedure test failed:', err.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyDefinitivaTotal();