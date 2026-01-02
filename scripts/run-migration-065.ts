/**
 * Migration 065 Runner: Hashtag Embeddings Infrastructure
 *
 * Executa a migration 065 que cria:
 * - hashtag_embeddings: embedding individual de cada hashtag
 * - lead_cluster_mapping: mapeamento lead -> clusters
 * - campaign_leads: leads por campanha
 * - Adiciona centroid em hashtag_clusters_dynamic
 *
 * Uso: npx ts-node scripts/run-migration-065.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚀 Migration 065: Hashtag Embeddings Infrastructure\n');
  console.log('📋 Este script cria:');
  console.log('   - hashtag_embeddings (embedding por hashtag)');
  console.log('   - lead_cluster_mapping (lead -> clusters)');
  console.log('   - campaign_leads (leads por campanha)');
  console.log('   - centroid em hashtag_clusters_dynamic\n');

  const migrationPath = path.join(__dirname, '../database/migrations/065_hashtag_embeddings_infrastructure.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  // Split em statements individuais (ignorando comentários)
  const statements = migrationSQL
    .split(/;[\s]*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.match(/^--/));

  console.log(`📊 ${statements.length} statements para executar\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 70);

    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);

    try {
      // Tentar executar via RPC execute_sql se disponível
      const { error } = await supabase.rpc('execute_sql', {
        query_text: stmt + ';'
      });

      if (error) {
        if (error.message.includes('already exists') ||
            error.message.includes('duplicate key') ||
            error.message.includes('does not exist')) {
          console.log('⏭️  Skip (já existe)');
          skipCount++;
        } else {
          console.log(`⚠️  ${error.message.substring(0, 50)}`);
          errorCount++;
        }
      } else {
        console.log('✅');
        successCount++;
      }
    } catch (err: any) {
      console.log(`❌ ${err.message?.substring(0, 50) || 'Unknown error'}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Resultado:`);
  console.log(`   ✅ Sucesso: ${successCount}`);
  console.log(`   ⏭️  Skip: ${skipCount}`);
  console.log(`   ⚠️  Erros: ${errorCount}`);
  console.log('='.repeat(50));

  if (errorCount > 0) {
    console.log('\n⚠️  Alguns erros ocorreram.');
    console.log('   Execute a migration diretamente no Supabase SQL Editor:');
    console.log(`   ${migrationPath}`);
  }
}

// Verificar se existe RPC execute_sql
async function checkPrerequisites() {
  console.log('🔍 Verificando pré-requisitos...\n');

  // Check if execute_sql exists
  const { error: rpcError } = await supabase.rpc('execute_sql', {
    query_text: 'SELECT 1'
  });

  if (rpcError && rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
    console.log('⚠️  RPC execute_sql não encontrado.');
    console.log('   A migration precisa ser executada diretamente no Supabase SQL Editor.');
    console.log('\n📋 Copie o conteúdo de:');
    console.log('   database/migrations/065_hashtag_embeddings_infrastructure.sql');
    console.log('\n   E execute em: https://supabase.com/dashboard → SQL Editor');
    return false;
  }

  console.log('✅ RPC execute_sql disponível\n');
  return true;
}

async function main() {
  const canRun = await checkPrerequisites();

  if (canRun) {
    await runMigration();
  } else {
    // Mostrar instruções alternativas
    console.log('\n📋 Alternativa: Execute manualmente no Supabase SQL Editor');
    console.log('   1. Acesse https://supabase.com/dashboard');
    console.log('   2. Selecione o projeto');
    console.log('   3. Vá em SQL Editor');
    console.log('   4. Cole o conteúdo de database/migrations/065_hashtag_embeddings_infrastructure.sql');
    console.log('   5. Execute');
  }
}

main().catch(console.error);
