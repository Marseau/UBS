/**
 * Apply Migration 022: Remove redundant approval fields
 * Executa migration para remover campos não utilizados
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Applying Migration 022: Remove redundant approval fields...\n');

  const migrationPath = path.join(__dirname, '../database/migrations/022_remove_redundant_approval_fields.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  console.log('📄 Migration SQL:');
  console.log(migrationSQL);
  console.log('\n');

  try {
    // Supabase REST API não suporta ALTER TABLE diretamente
    // Precisamos executar via SQL Editor no painel ou usar postgres client
    console.log('⚠️  ATENÇÃO: Esta migration precisa ser executada manualmente no Supabase SQL Editor');
    console.log('📍 Acesse: https://supabase.com/dashboard/project/qsdfyffuonywghyerrmj/sql/new');
    console.log('\n📋 Cole o seguinte SQL:\n');
    console.log('─'.repeat(80));
    console.log(migrationSQL);
    console.log('─'.repeat(80));
    console.log('\n✅ Após executar, os campos redundantes serão removidos.');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigration();
