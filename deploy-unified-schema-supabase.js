require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployUnifiedSchemaToSupabase() {
  try {
    console.log('🚀 DEPLOYING UNIFIED SCHEMA DIRECTLY TO SUPABASE');
    console.log('This will execute the SQL via JavaScript instead of manual copy-paste\n');
    
    // Read the corrected schema file
    const sqlContent = fs.readFileSync('./database/platform-metrics-unified-schema.sql', 'utf8');
    
    console.log('📄 Executing unified schema SQL...');
    console.log(`📏 Size: ${Math.round(sqlContent.length / 1024)}KB`);
    
    // Execute the SQL directly
    const { data, error } = await client.rpc('exec_sql', { 
      sql_query: sqlContent 
    });
    
    if (error) {
      console.log('❌ Direct SQL execution failed:', error.message);
      console.log('💡 Trying alternative approach: split into smaller queries\n');
      
      // Alternative: Execute key parts separately
      const parts = sqlContent.split(';').filter(part => part.trim());
      let successCount = 0;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part && !part.startsWith('/*') && !part.startsWith('--')) {
          try {
            const { error: partError } = await client.rpc('exec_sql', { 
              sql_query: part + ';' 
            });
            
            if (partError) {
              console.log(`⚠️ Query ${i+1} failed:`, partError.message);
            } else {
              successCount++;
            }
          } catch (err) {
            console.log(`⚠️ Query ${i+1} error:`, err.message);
          }
        }
      }
      
      console.log(`📊 Executed ${successCount}/${parts.length} queries successfully`);
      
    } else {
      console.log('✅ Unified schema deployed successfully!');
      console.log('Result:', data);
    }
    
    // Test if deployment worked by checking the function
    console.log('\n🔍 Verifying deployment...');
    const { data: testResult, error: testError } = await client.rpc('aggregate_platform_metrics_unified', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_specific_period: '30d'
    });
    
    if (testError) {
      console.log('❌ Deployment verification failed:', testError.message);
      console.log('💡 The function may not be deployed correctly');
      
      // Show manual deployment instructions
      console.log('\n🔧 MANUAL DEPLOYMENT REQUIRED:');
      console.log('1. Copy the content from database/platform-metrics-unified-schema.sql');
      console.log('2. Execute in Supabase SQL Editor');
      console.log('3. Then run: node test-unified-platform-aggregation.js');
      
    } else {
      console.log('✅ Deployment verified! Function is working');
      console.log('Result:', JSON.stringify(testResult, null, 2));
      
      console.log('\n🎉 SUCCESS! Now run the test:');
      console.log('node test-unified-platform-aggregation.js');
    }
    
  } catch (error) {
    console.error('❌ Deployment error:', error.message);
    
    console.log('\n🔧 FALLBACK: Manual deployment required');
    console.log('1. Open Supabase SQL Editor');
    console.log('2. Copy content from database/platform-metrics-unified-schema.sql');  
    console.log('3. Execute the SQL');
    console.log('4. Run: node test-unified-platform-aggregation.js');
  }
}

deployUnifiedSchemaToSupabase();