import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data, error } = await supabase
    .from('instagram_leads')
    .select('username, email, phone, full_name')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log('📊 Amostra de 10 leads do banco:');
  console.log('');

  data?.forEach((lead, i) => {
    console.log(`${i + 1}. @${lead.username}`);
    console.log(`   Full Name: ${lead.full_name || '(vazio)'}`);
    console.log(`   Email: ${lead.email || '(vazio)'}`);
    console.log(`   Phone: ${lead.phone || '(vazio)'}`);
    console.log('');
  });

  // Estatísticas
  const { count: totalLeads } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  const { count: withEmail } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('email', 'is', null);

  const { count: withPhone } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  console.log(`📊 Totais: ${totalLeads} leads`);
  console.log(`   Com email: ${withEmail} (${((withEmail! / totalLeads!) * 100).toFixed(1)}%)`);
  console.log(`   Com phone: ${withPhone} (${((withPhone! / totalLeads!) * 100).toFixed(1)}%)`);
})();
