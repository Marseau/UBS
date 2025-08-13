const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exploreSchema() {
  console.log('🔍 Exploring database schema...');
  
  try {
    // Get a single record from conversation_history to see structure
    const { data: sampleConversation, error: convError } = await supabase
      .from('conversation_history')
      .select('*')
      .limit(1);

    if (convError) {
      console.error('❌ Error fetching conversation_history sample:', convError);
    } else {
      console.log('📊 conversation_history structure:');
      console.log(Object.keys(sampleConversation[0] || {}));
      console.log('Sample record:', sampleConversation[0]);
    }

    console.log('');

    // Get a single record from appointments to see structure
    const { data: sampleAppointment, error: aptError } = await supabase
      .from('appointments')
      .select('*')
      .limit(1);

    if (aptError) {
      console.error('❌ Error fetching appointments sample:', aptError);
    } else {
      console.log('📅 appointments structure:');
      console.log(Object.keys(sampleAppointment[0] || {}));
      console.log('Sample record:', sampleAppointment[0]);
    }

    console.log('');

    // Check tenants structure
    const { data: sampleTenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .limit(1);

    if (tenantError) {
      console.error('❌ Error fetching tenants sample:', tenantError);
    } else {
      console.log('🏢 tenants structure:');
      console.log(Object.keys(sampleTenant[0] || {}));
    }

  } catch (error) {
    console.error('❌ Error exploring schema:', error);
  }
}

exploreSchema().catch(console.error);