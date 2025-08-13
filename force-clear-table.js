const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function forceClearTable() {
  try {
    console.log('🧹 Force clearing tenant_metrics table...');
    
    // Try different approaches to clear the table
    
    // Method 1: Delete with count
    console.log('Method 1: Delete with count...');
    const { count: countResult, error: countError } = await client
      .from('tenant_metrics')
      .delete({ count: 'exact' })
      .neq('created_at', '1900-01-01'); // Should match all records
    
    console.log(`Count method result: ${countResult} deleted, error:`, countError);
    
    // Method 2: Delete without filter
    console.log('Method 2: Delete all records...');
    const { data: dataResult, error: dataError } = await client
      .from('tenant_metrics')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000'); // Should match all
    
    console.log(`Data method result:`, dataResult ? 'Success' : 'Failed', 'error:', dataError);
    
    // Method 3: Truncate approach (via custom function if available)
    console.log('Method 3: Testing table status...');
    const { count: remainingCount, error: checkError } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Remaining records: ${remainingCount}, error:`, checkError);
    
    if ((remainingCount || 0) > 0) {
      console.log('⚠️ Table not completely cleared. Trying individual deletes...');
      
      // Get all IDs and delete individually
      const { data: allRecords } = await client
        .from('tenant_metrics')
        .select('id');
      
      if (allRecords && allRecords.length > 0) {
        console.log(`Found ${allRecords.length} records to delete individually...`);
        
        for (let i = 0; i < allRecords.length; i++) {
          const { error: deleteError } = await client
            .from('tenant_metrics')
            .delete()
            .eq('id', allRecords[i].id);
          
          if (deleteError) {
            console.log(`Error deleting record ${i + 1}:`, deleteError);
          } else {
            console.log(`✅ Deleted record ${i + 1}/${allRecords.length}`);
          }
        }
      }
    }
    
    // Final check
    const { count: finalCount } = await client
      .from('tenant_metrics')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📊 Final status: ${finalCount || 0} records remaining`);
    
    if ((finalCount || 0) === 0) {
      console.log('✅ Table successfully cleared!');
    } else {
      console.log('❌ Table still has records. May need manual intervention.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

forceClearTable();