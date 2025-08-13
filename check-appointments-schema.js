require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAppointmentsSchema() {
  try {
    console.log('🔍 Checking appointments table schema...\n');
    
    // Get a sample record to see the actual column names
    const { data: sample, error } = await client
      .from('appointments')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('❌ Error querying appointments:', error);
      return;
    }
    
    if (!sample || sample.length === 0) {
      console.log('⚠️ No records found in appointments table');
      return;
    }
    
    console.log('📋 APPOINTMENTS TABLE COLUMNS:');
    console.log('=====================================');
    
    const columns = Object.keys(sample[0]);
    columns.forEach((col, index) => {
      const value = sample[0][col];
      const type = typeof value;
      console.log(`${(index + 1).toString().padStart(2, ' ')}. ${col} (${type}): ${value}`);
    });
    
    console.log('\n🔍 CUSTOMER ID FIELD ANALYSIS:');
    console.log('=====================================');
    
    const customerFields = columns.filter(col => 
      col.toLowerCase().includes('customer') || 
      col.toLowerCase().includes('user') ||
      col.toLowerCase().includes('client')
    );
    
    if (customerFields.length > 0) {
      console.log('✅ Found potential customer ID fields:');
      customerFields.forEach(field => {
        console.log(`   - ${field}`);
      });
    } else {
      console.log('❌ No obvious customer ID fields found');
    }
    
    // Check if user_id exists
    if (columns.includes('user_id')) {
      console.log('\n✅ SOLUTION: Use "user_id" instead of "customer_id"');
    } else if (columns.includes('customer_id')) {
      console.log('\n⚠️ customer_id exists - might be permission issue');
    } else {
      console.log('\n❌ Neither user_id nor customer_id found');
      console.log('Need to identify the correct customer identifier field');
    }
    
  } catch (error) {
    console.error('❌ Schema check error:', error.message);
  }
}

checkAppointmentsSchema();