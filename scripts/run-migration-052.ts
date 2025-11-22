import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('\n🎭 Executando Migration 052 - Sistema de Personas Dinâmicas\n');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, '../database/migrations/052_dynamic_personas_system.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    // Dividir em statements (separar por ;)
    const statements = sqlContent
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📄 ${statements.length} statements SQL para executar\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] as string;

      // Pular comentários de bloco
      if (!statement || statement.startsWith('/*') || statement.length < 10) continue;

      console.log(`   [${i + 1}/${statements.length}] Executando...`);

      const { error } = await supabase.rpc('execute_sql', {
        query_text: statement + ';'
      });

      if (error) {
        // Ignorar erros de "já existe"
        if (error.message.includes('already exists') ||
            error.message.includes('já existe') ||
            error.message.includes('duplicate')) {
          console.log(`      ⚠️  Já existe (OK)`);
          successCount++;
        } else {
          console.error(`      ❌ Erro: ${error.message.substring(0, 100)}`);
          errorCount++;
        }
      } else {
        console.log(`      ✅ Sucesso`);
        successCount++;
      }
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`\n🎉 Migration 052 concluída!`);
    console.log(`   ✅ Sucesso: ${successCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log('\n📋 Tabelas criadas:');
    console.log('   • dynamic_personas - Personas dinâmicas geradas por GPT');
    console.log('   • lead_persona_assignments - Associação lead-persona');
    console.log('   • persona_evolution_history - Histórico de evolução');
    console.log('   • v_personas_dashboard - View para dashboard\n');

  } catch (error: any) {
    console.error('❌ Erro fatal na migration:', error.message);
    process.exit(1);
  }
}

runMigration().then(() => {
  console.log('✅ Script finalizado\n');
  process.exit(0);
}).catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
