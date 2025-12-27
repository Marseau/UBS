import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const usernames = [
    'ingridnoliveiranails', 'visuonoficial', 'pellomenos',
    'academiaalma_oficial', 'gftmax', 'iberitechsoftware',
    'anibaltecautomacao', 'crmvsp', 'htdsistemas', 'software_empresas_actana'
  ];

  const { data } = await supabase
    .from('instagram_leads')
    .select('username, whatsapp_number, whatsapp_source, whatsapp_url_status')
    .in('username', usernames);

  console.log('📊 Verificação de persistência (10 leads):\n');
  let ok = 0;
  data?.forEach(l => {
    const status = l.whatsapp_number ? '✅' : '❌';
    if (l.whatsapp_number) ok++;
    console.log(`${status} @${l.username.padEnd(25)} → ${l.whatsapp_number || 'NULL'} (source: ${l.whatsapp_source || '-'}, status: ${l.whatsapp_url_status})`);
  });
  console.log(`\n📈 Persistidos: ${ok}/${data?.length}`);
}
check();
