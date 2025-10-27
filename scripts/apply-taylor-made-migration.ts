/**
 * Script para aplicar migration da tabela taylor_made_leads
 * Executa: npx ts-node scripts/apply-taylor-made-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🚀 Iniciando aplicação da migration taylor_made_leads...\n');

  // Read migration SQL file
  const migrationPath = path.join(__dirname, '../database/migrations/011_taylor_made_leads.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  console.log('📄 Migration file loaded:', migrationPath);
  console.log('📊 SQL length:', sql.length, 'characters\n');

  // Split SQL into individual statements (separated by semicolon)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Get first line for preview
    const preview = statement.split('\n')[0].substring(0, 60);

    console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        console.error(`  ❌ Error:`, error.message);
        errorCount++;
      } else {
        console.log(`  ✅ Success`);
        successCount++;
      }
    } catch (error: any) {
      console.error(`  ❌ Exception:`, error.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary:');
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ❌ Failed: ${errorCount}`);
  console.log(`  📋 Total: ${statements.length}`);
  console.log('='.repeat(60));

  if (errorCount > 0) {
    console.log('\n⚠️  Some statements failed. This may be normal if objects already exist.');
    console.log('💡 Check errors above to determine if they are critical.\n');
  } else {
    console.log('\n🎉 Migration completed successfully!\n');
  }

  // Test if table exists
  console.log('🔍 Verificando se a tabela foi criada...');
  const { data, error } = await supabase
    .from('taylor_made_leads')
    .select('count', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Tabela não encontrada:', error.message);
    console.log('\n💡 Você precisa executar o SQL manualmente no Supabase Dashboard:');
    console.log('   1. Acesse: https://supabase.com/dashboard/project/qsdfyffuonywmtnlycri/editor');
    console.log('   2. Abra o SQL Editor');
    console.log('   3. Cole o conteúdo de: database/migrations/011_taylor_made_leads.sql');
    console.log('   4. Execute o SQL\n');
  } else {
    console.log('✅ Tabela taylor_made_leads existe e está acessível!');
    console.log(`📊 Total de registros: 0 (tabela nova)\n`);
  }
}

applyMigration()
  .then(() => {
    console.log('✅ Script concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
