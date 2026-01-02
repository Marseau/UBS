const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🔄 Executando migration 053...');

  const migrationSQL = fs.readFileSync(
    path.join(__dirname, 'database/migrations/053_cluster_projects_campaigns.sql'),
    'utf8'
  );

  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: migrationSQL
    });

    if (error) {
      console.error('❌ Erro ao executar migration:', error);
      process.exit(1);
    }

    console.log('✅ Migration 053 executada com sucesso!');
    console.log('📊 Resultado:', data);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  }
}

runMigration();
