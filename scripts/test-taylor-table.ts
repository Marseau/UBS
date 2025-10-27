import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testTable() {
  console.log('🔍 Verificando tabela taylor_made_leads...\n');

  const { data, error } = await supabase
    .from('taylor_made_leads')
    .select('*')
    .limit(1);

  if (error) {
    console.log('❌ Tabela não existe ou não está acessível');
    console.log('Erro:', error.message);
    console.log('\n📋 AÇÃO NECESSÁRIA:');
    console.log('Você precisa criar a tabela manualmente no Supabase:');
    console.log('\n1. Acesse: https://supabase.com/dashboard/project/qsdfyffuonywmtnlycri/editor');
    console.log('2. Clique em "SQL Editor" no menu lateral');
    console.log('3. Clique em "New query"');
    console.log('4. Cole todo o conteúdo de: database/migrations/011_taylor_made_leads.sql');
    console.log('5. Clique em "Run" (ou Ctrl+Enter)');
    console.log('6. Execute este script novamente para verificar\n');
    process.exit(1);
  } else {
    console.log('✅ Tabela taylor_made_leads existe e está acessível!');
    console.log('📊 Registros encontrados:', data?.length || 0);
    console.log('\n🎉 Landing page Taylor Made está pronta para receber leads!\n');
    process.exit(0);
  }
}

testTable();
