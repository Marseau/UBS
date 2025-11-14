import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkRecentLeads() {
  const { data, error } = await supabase
    .from('instagram_leads')
    .select('username, full_name, country, city, state, language, search_term_used, created_at')
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log('\n📊 Últimos 2 registros salvos:\n');
  data?.forEach((lead, index) => {
    console.log(`\n${index + 1}. @${lead.username}`);
    console.log(`   Nome: ${lead.full_name || 'NULL'}`);
    console.log(`   País: ${lead.country || 'NULL'}`);
    console.log(`   Cidade: ${lead.city || 'NULL'}`);
    console.log(`   Estado: ${lead.state || 'NULL'}`);
    console.log(`   Idioma: ${lead.language || 'NULL'}`);
    console.log(`   Termo usado: ${lead.search_term_used || 'NULL'}`);
    console.log(`   Criado em: ${lead.created_at}`);
  });
}

checkRecentLeads().then(() => process.exit(0));
