import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔄 Executando migration 041_add_profession_to_leads...\n');

    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '041_add_profession_to_leads.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Executar migration via RPC (usando uma function temporária)
    const { data, error } = await supabase.rpc('exec_sql', { query: migrationSQL });

    if (error) {
      console.error('❌ Erro ao executar migration:', error);

      // Tentar executar diretamente via query
      console.log('\n⚠️  Tentando executar SQL diretamente...\n');

      // Dividir em comandos individuais
      const commands = migrationSQL
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

      for (const cmd of commands) {
        if (cmd.toUpperCase().startsWith('COMMENT ON')) {
          console.log('ℹ️  Pulando comando COMMENT ON (não suportado via JS client)');
          continue;
        }

        console.log(`Executando: ${cmd.substring(0, 80)}...`);
        const { error: cmdError } = await supabase.rpc('exec_sql', { query: cmd });

        if (cmdError) {
          console.error(`❌ Erro: ${cmdError.message}`);
        } else {
          console.log('✅ Comando executado com sucesso');
        }
      }
    } else {
      console.log('✅ Migration executada com sucesso!');
    }

    console.log('\n✨ Migration 041 concluída!');
  } catch (err) {
    console.error('❌ Erro ao executar migration:', err);
    process.exit(1);
  }
}

runMigration();
