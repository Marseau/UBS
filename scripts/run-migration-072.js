const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  const sql = fs.readFileSync('./database/migrations/072_cluster_campaigns_missing_columns.sql', 'utf8');

  // Separar comandos e executar um por um
  const commands = sql.split(';').filter(cmd => cmd.trim().length > 0 && !cmd.trim().startsWith('--'));

  for (const cmd of commands) {
    const trimmedCmd = cmd.trim();
    if (trimmedCmd.length < 5) continue;

    console.log('Executando:', trimmedCmd.substring(0, 60) + '...');
    const { error } = await supabase.rpc('execute_sql', { query_text: trimmedCmd });
    if (error) {
      console.error('Erro:', error.message);
    } else {
      console.log('OK');
    }
  }

  console.log('\nMigration 072 concluída!');
}

runMigration().catch(console.error);
