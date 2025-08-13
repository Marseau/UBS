const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyNulls() {
  try {
    // Get some sample data to verify structure
    const { data: sampleData, error: sampleError } = await supabase
      .from('conversation_history')
      .select('id, conversation_outcome, created_at')
      .limit(10);
    
    if (sampleError) throw sampleError;
    
    console.log('=== SAMPLE DATA ===');
    sampleData.forEach((row, index) => {
      console.log(`${index + 1}. ID: ${row.id}, Outcome: ${row.conversation_outcome}, Created: ${row.created_at}`);
    });
    
    // Explicitly check for NULL values using RPC if possible
    const { data: nullCheck, error: nullError } = await supabase
      .from('conversation_history')
      .select('id')
      .is('conversation_outcome', null)
      .limit(5);
    
    if (nullError) {
      console.log('NULL check error:', nullError.message);
    } else {
      console.log('\n=== EXPLICIT NULL CHECK ===');
      console.log('Rows with NULL conversation_outcome:', nullCheck.length);
      if (nullCheck.length > 0) {
        console.log('Sample NULL IDs:', nullCheck.map(r => r.id));
      }
    }
    
    // Check distinct values
    const { data: distinctData, error: distinctError } = await supabase
      .from('conversation_history')
      .select('conversation_outcome')
      .limit(1000);
    
    if (distinctError) {
      console.log('Distinct check error:', distinctError.message);
    } else {
      const distinctValues = [...new Set(distinctData.map(r => r.conversation_outcome))];
      console.log('\n=== DISTINCT VALUES ===');
      console.log('Unique conversation_outcome values:', distinctValues);
      console.log('Total unique values:', distinctValues.length);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyNulls();