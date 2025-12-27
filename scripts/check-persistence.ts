import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const usernames = ['irisferreira.socialmedia', 'acr_comunicacao'];

  const { data } = await supabase
    .from('instagram_leads')
    .select('username, whatsapp_number, whatsapp_numbers, whatsapp_url_status')
    .in('username', usernames);

  console.log('Verificando persistencia:\n');
  data?.forEach(l => {
    console.log('@' + l.username);
    console.log('  whatsapp_number:', l.whatsapp_number || 'NULL');
    console.log('  whatsapp_numbers:', JSON.stringify(l.whatsapp_numbers));
    console.log('  whatsapp_url_status:', l.whatsapp_url_status);
    console.log('');
  });
}
main();
