import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data, error } = await supabase
    .from('instagram_leads')
    .select('id, username')
    .in('username', ['ct.simular', 'profsaude.nacional', 'olhosepesokids'])
    .limit(3);

  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }

  console.log('📋 3 Leads para testar:\n');
  data?.forEach((lead, index) => {
    console.log(`${index + 1}. @${lead.username} (ID: ${lead.id})`);
  });
})();
