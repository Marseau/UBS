const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getConversationCounts() {
  try {
    // Get all conversation_outcome values
    const { data, error } = await supabase
      .from('conversation_history')
      .select('conversation_outcome, created_at');
    
    if (error) throw error;
    
    const totalConversations = data.length;
    const withOutcome = data.filter(row => row.conversation_outcome !== null).length;
    const nullCount = data.filter(row => row.conversation_outcome === null).length;
    const nullPercentage = ((nullCount / totalConversations) * 100).toFixed(2);
    
    console.log('=== CONVERSATION ANALYSIS ===');
    console.log('Total conversations:', totalConversations);
    console.log('With outcome:', withOutcome);
    console.log('NULL count:', nullCount);
    console.log('NULL percentage:', nullPercentage + '%');
    
    // Get recent NULLs (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const recentNulls = data.filter(row => {
      return row.conversation_outcome === null && 
             new Date(row.created_at) > oneDayAgo;
    }).length;
    
    console.log('\n=== RECENT NULL ANALYSIS ===');
    console.log('Recent NULLs (last 24h):', recentNulls);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getConversationCounts();