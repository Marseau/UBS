require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTableStructure() {
  console.log('🔍 Verificando estrutura da tabela instagram_leads...\n');

  // Pegar um registro de exemplo para ver as colunas
  const { data, error } = await supabase
    .from('instagram_leads')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }

  if (data && data.length > 0) {
    console.log('📋 Colunas disponíveis:');
    const columns = Object.keys(data[0]);
    columns.forEach(col => {
      const value = data[0][col];
      const type = typeof value;
      console.log(`   • ${col} (${type}): ${value !== null ? String(value).substring(0, 50) : 'null'}`);
    });
  } else {
    console.log('⚠️  Tabela vazia ou não encontrada');
  }
}

checkTableStructure();
