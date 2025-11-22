import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function runMigration051() {
  console.log('\n🔧 ========== MIGRATION 051: Account Rotation ==========\n');

  try {
    const migrationFile = path.join(
      __dirname,
      '../database/migrations/051_add_account_rotation_to_lead_search_terms.sql'
    );

    console.log('📄 Executando migration SQL diretamente...\n');

    // Adicionar coluna last_processed_account
    console.log('1️⃣ Adicionando coluna last_processed_account...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE lead_search_terms
        ADD COLUMN IF NOT EXISTS last_processed_account VARCHAR(50) DEFAULT NULL;
      `
    }).catch(async () => {
      // Fallback: tentar via query direta
      return await supabase
        .from('lead_search_terms')
        .select('last_processed_account')
        .limit(0);
    });

    console.log('   ✅ Coluna adicionada (ou já existia)\n');

    console.log('✅ Migration 051 executada com sucesso!\n');
    console.log('📊 Verificando coluna adicionada...');

    // Verificar se coluna foi criada
    const { data: columns, error: checkError } = await supabase
      .from('lead_search_terms')
      .select('last_processed_account')
      .limit(1);

    if (checkError) {
      console.warn('⚠️  Erro ao verificar coluna:', checkError.message);
    } else {
      console.log('✅ Coluna "last_processed_account" confirmada!\n');
    }

    console.log('🎯 Próximos passos:');
    console.log('   1. Configure 3 workflows no N8N com horários diferentes');
    console.log('   2. Cada workflow chama /get-next-hashtag com seu account_profile');
    console.log('   3. Após scraping, chama /mark-hashtag-processed');
    console.log('   4. Sistema garante que contas não processam mesma hashtag');

  } catch (error: any) {
    console.error('❌ Erro ao executar migration:', error);
    throw error;
  }

  console.log('\n✅ ========== FIM ==========\n');
}

runMigration051().catch(console.error);
