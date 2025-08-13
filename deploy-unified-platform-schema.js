require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployUnifiedPlatformSchema() {
  try {
    console.log('🚀 DEPLOYING UNIFIED PLATFORM METRICS SCHEMA');
    console.log('This will align platform_metrics with tenant_metrics structure');
    console.log('🎯 Key benefit: platform_mrr = SUM(tenant subscription costs)');
    console.log('🔄 Architecture: Identical JSONB structure for uniformity\n');
    
    // Read the unified schema file
    const sqlContent = fs.readFileSync('./database/platform-metrics-unified-schema.sql', 'utf8');
    
    console.log('📋 DEPLOYMENT SUMMARY:');
    console.log('✅ Backs up existing platform_metrics table');
    console.log('✅ Recreates table with tenant_metrics structure');
    console.log('✅ Same JSONB modules: financial_metrics, appointment_metrics, etc.');
    console.log('✅ Unified aggregation function with weighted averages');
    console.log('✅ Platform MRR calculation from tenant subscription costs\n');
    
    // For manual deployment, show instructions
    console.log('🔧 MANUAL DEPLOYMENT REQUIRED:');
    console.log('1. Copy the SQL content to Supabase SQL Editor');
    console.log('2. Execute the unified schema migration');
    console.log('3. Run the test aggregation\n');
    
    console.log('📄 SQL FILE LOCATION: ./database/platform-metrics-unified-schema.sql');
    console.log('📏 File size:', Math.round(sqlContent.length / 1024), 'KB');
    
    // Show preview of the SQL
    const preview = sqlContent.substring(0, 500) + '...';
    console.log('\n📖 PREVIEW:');
    console.log(preview);
    
    console.log('\n🎯 EXPECTED OUTCOME AFTER DEPLOYMENT:');
    console.log('✅ platform_metrics table with same structure as tenant_metrics');
    console.log('✅ JSONB metric_data field with organized modules');
    console.log('✅ platform_mrr calculation from aggregated tenant costs');
    console.log('✅ Uniform data processing across both tables');
    console.log('✅ Ready for Super Admin Dashboard integration');
    
    console.log('\n⏭️ NEXT STEPS AFTER MANUAL DEPLOYMENT:');
    console.log('1. Run: node test-unified-platform-aggregation.js');
    console.log('2. Verify platform_metrics table structure');
    console.log('3. Check MRR calculation accuracy');
    console.log('4. Integrate with existing dashboard');
    
  } catch (error) {
    console.error('❌ Deployment preparation failed:', error.message);
  }
}

deployUnifiedPlatformSchema();