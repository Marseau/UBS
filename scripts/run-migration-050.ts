import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('\n🚀 Executando Migration 050: Dynamic Hashtag Intelligence System\n');

  const migrationPath = path.join(__dirname, '../database/migrations/050_dynamic_hashtag_intelligence_system.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration SQL carregada');
  console.log(`📏 Tamanho: ${sql.length} caracteres`);
  console.log('\n⏳ Executando migration via RPC...\n');

  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: sql
    });

    if (error) {
      console.error('❌ Erro ao executar migration:', error);
      process.exit(1);
    }

    console.log('✅ Migration executada com sucesso!');
    console.log('\n📊 Objetos criados:');
    console.log('   • 4 tabelas (clusters_dynamic, behavioral_insights, performance_metrics, trends)');
    console.log('   • 2 funções (calculate_opportunity_score, update_scores)');
    console.log('   • 2 views (clusters_with_insights, emerging_trends)');
    console.log('   • 10+ índices para performance');
    console.log('   • 2 triggers para auto-update');
    console.log('\n🎉 Sistema Dynamic Hashtag Intelligence 2.0 pronto!\n');

  } catch (err) {
    console.error('❌ Exceção ao executar migration:', err);
    process.exit(1);
  }
}

runMigration();
