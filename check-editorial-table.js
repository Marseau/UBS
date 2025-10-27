const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEditorialTable() {
  try {
    // Check if editorial_content table exists
    const { data, error } = await supabase
      .from('editorial_content')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Error:', error.message);
      console.log('Table does NOT exist or query failed');
    } else {
      console.log('✅ Table editorial_content exists!');
      console.log('Sample data:', data);
    }

    // List all tables
    const { data: tables, error: tablesError } = await supabase.rpc('get_tables');
    if (!tablesError && tables) {
      console.log('\n📋 Available tables:', tables);
    }

  } catch (err) {
    console.error('Fatal error:', err);
  }

  process.exit(0);
}

checkEditorialTable();
