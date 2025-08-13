const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearTableOnly() {
  try {
    console.log('🧹 Clearing tenant_metrics table...');
    
    // Clear all records from tenant_metrics
    const { count: deletedCount, error: deleteError } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('❌ Error clearing table:', deleteError);
      process.exit(1);
    }
    
    console.log(`✅ Cleared ${deletedCount || 0} records from tenant_metrics`);
    
    // Verify table is empty
    const { count: remainingCount, error: countError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Error checking remaining count:', countError);
    } else {
      console.log(`📊 Table is now empty: ${remainingCount || 0} records remaining`);
    }
    
    console.log('\n✅ Table cleared successfully! Now run the cronjob with:');
    console.log('npm run metrics:comprehensive');
    
  } catch (error) {
    console.error('❌ Error clearing table:', error.message);
    process.exit(1);
  }
}

clearTableOnly();