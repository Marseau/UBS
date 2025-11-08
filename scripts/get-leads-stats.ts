import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log('📊 Buscando estatísticas de leads Instagram...\n');

  try {
    // Buscar todos os leads
    const { data: allLeads, error } = await supabase
      .from('instagram_leads')
      .select('email, phone');

    if (error) {
      console.error('❌ Erro ao buscar leads:', error);
      process.exit(1);
    }

    const total = allLeads?.length || 0;
    const comEmail = allLeads?.filter(l => l.email !== null).length || 0;
    const comTelefone = allLeads?.filter(l => l.phone !== null).length || 0;
    const comEmailETelefone = allLeads?.filter(l => l.email !== null && l.phone !== null).length || 0;
    const comContato = allLeads?.filter(l => l.email !== null || l.phone !== null).length || 0;
    const semContato = total - comContato;
    const percentualComContato = total > 0 ? ((comContato / total) * 100).toFixed(2) : '0.00';

    console.log('📈 ESTATÍSTICAS GERAIS:');
    console.log(`   Total de leads: ${total}`);
    console.log(`   Leads com pelo menos 1 contato: ${comContato} (${percentualComContato}%)`);
    console.log(`   Leads com email: ${comEmail}`);
    console.log(`   Leads com telefone: ${comTelefone}`);
    console.log(`   Leads com email E telefone: ${comEmailETelefone}`);
    console.log(`   Leads SEM contato: ${semContato}`);

  } catch (error: any) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
})();
