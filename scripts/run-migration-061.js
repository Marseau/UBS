const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('Executando migration 061...');

  // Adicionar coluna hashtag_origem
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: `ALTER TABLE pre_leads ADD COLUMN IF NOT EXISTS hashtag_origem TEXT;`
  });

  if (error) {
    console.error('Erro na migration:', error);
    // Tentar via query direta
    console.log('Tentando via SQL direto...');
  } else {
    console.log('✅ Coluna hashtag_origem adicionada com sucesso!');
  }
}

runMigration();
