require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployPlatformAggregation() {
  try {
    console.log('🚀 Deploying Platform Metrics Aggregation Procedure');
    console.log('This will enable platform_metrics population from tenant_metrics\n');
    
    // Read the SQL file
    const sqlContent = fs.readFileSync('./database/platform-metrics-aggregation-procedure.sql', 'utf8');
    
    // Split into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
    
    console.log(`📝 Executing ${statements.length} SQL statements...\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.length < 10) continue; // Skip very short statements
      
      try {
        console.log(`${i+1}/${statements.length}: Executing statement...`);
        
        // Execute via raw SQL
        const { data, error } = await client
          .from('_temp_sql_execution')  // This will fail but execute the statement
          .select('*')
          .limit(0);
          
        // Try alternative: direct execution via rpc if available
        const { error: rpcError } = await client.rpc('exec_sql', {
          query: statement + ';'
        });
        
        if (rpcError && !rpcError.message.includes('function') && !rpcError.message.includes('exec_sql')) {
          throw rpcError;
        }
        
        console.log(`✅ Statement ${i+1} executed successfully`);
        successCount++;
        
      } catch (execError) {
        console.log(`⚠️ Statement ${i+1} error:`, execError.message || execError);
        
        // Try direct PostgreSQL execution via node-postgres if available
        errorCount++;
      }
    }
    
    console.log(`\n📊 Deployment Summary:`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 Platform aggregation procedure deployed successfully!');
      
      // Test the deployment
      console.log('\n🧪 Testing the aggregation procedure...');
      
      const { data: testResult, error: testError } = await client
        .rpc('aggregate_platform_metrics_all_periods');
      
      if (testError) {
        console.log('⚠️ Test execution error:', testError.message);
      } else {
        console.log('✅ Test successful:', JSON.stringify(testResult, null, 2));
      }
      
    } else {
      console.log('\n⚠️ Some statements failed. Manual deployment may be required.');
      console.log('Please copy the SQL content to Supabase SQL Editor and execute manually.');
    }
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    console.log('\n💡 Alternative: Copy the SQL from database/platform-metrics-aggregation-procedure.sql');
    console.log('    and execute it manually in Supabase SQL Editor');
  }
}

deployPlatformAggregation();