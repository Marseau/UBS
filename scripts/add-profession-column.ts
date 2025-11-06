import { supabase } from '../src/config/database';

async function addProfessionColumn() {
  try {
    console.log('🔄 Adicionando coluna profession à tabela instagram_leads...\n');

    // Usar raw query via from().select() não funcionará para DDL
    // Vamos usar uma estratégia diferente: tentar inserir/update e verificar se funciona

    // Testar se a coluna já existe tentando fazer uma query
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('profession')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Coluna profession não existe. Por favor, execute o SQL manualmente no Supabase Dashboard:\n');
        console.log('-----');
        console.log('ALTER TABLE instagram_leads ADD COLUMN profession TEXT;');
        console.log('CREATE INDEX idx_instagram_leads_profession ON instagram_leads(profession);');
        console.log('-----\n');
        console.log('URL do Supabase Dashboard: https://supabase.com/dashboard/project/_/editor');
      } else {
        console.error('❌ Erro ao verificar coluna:', error);
      }
    } else {
      console.log('✅ Coluna profession já existe na tabela instagram_leads!');
    }
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

addProfessionColumn();
