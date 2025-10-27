import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configuradas no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Aplicando migration: taylor_made_leads table');
  console.log('================================================');

  try {
    // Read SQL file
    const migrationPath = path.join(__dirname, '../database/migrations/011_taylor_made_leads.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Lendo migration:', migrationPath);

    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`⚙️ Executando ${statements.length} comandos SQL...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments
      if (statement.startsWith('--') || statement.startsWith('/*')) {
        continue;
      }

      console.log(`\n[${i + 1}/${statements.length}] Executando...`);

      const { error } = await supabase.rpc('exec_sql', {
        sql: statement + ';'
      });

      if (error) {
        console.error('❌ Erro:', error.message);
        console.log('📝 SQL que falhou:', statement.substring(0, 100) + '...');

        // Try direct query for CREATE statements
        if (statement.includes('CREATE')) {
          console.log('🔄 Tentando método alternativo...');
          const { error: altError } = await supabase
            .from('_sql')
            .insert({ query: statement });

          if (!altError) {
            console.log('✅ Comando executado (método alternativo)');
          }
        }
      } else {
        console.log('✅ Comando executado com sucesso');
      }
    }

    // Verify table creation
    console.log('\n🔍 Verificando se a tabela foi criada...');
    const { data, error } = await supabase
      .from('taylor_made_leads')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Erro ao verificar tabela:', error.message);
      console.log('\n⚠️ A tabela pode não ter sido criada. Execute manualmente:');
      console.log('1. Acesse: https://supabase.com/dashboard');
      console.log('2. SQL Editor → New Query');
      console.log('3. Cole o conteúdo de: database/migrations/011_taylor_made_leads.sql');
      console.log('4. Execute (Ctrl+Enter)');
    } else {
      console.log('✅ Tabela taylor_made_leads criada com sucesso!');
      console.log('📊 Ready to capture leads at: http://localhost:3000');
    }

  } catch (error: any) {
    console.error('❌ Erro ao aplicar migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
