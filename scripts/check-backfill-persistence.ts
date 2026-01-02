import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // Verificar quantos leads têm whatsapp_reverified_at preenchido
  const { count } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('whatsapp_reverified_at', 'is', null);

  console.log('📊 Leads com whatsapp_reverified_at:', count || 0);

  // Ver alguns exemplos
  const { data } = await supabase
    .from('instagram_leads')
    .select('username, whatsapp_reverified_at, whatsapp_number')
    .not('whatsapp_reverified_at', 'is', null)
    .order('whatsapp_reverified_at', { ascending: false })
    .limit(10);

  if (data && data.length > 0) {
    console.log('\n📋 Últimos re-verificados:');
    data.forEach(l => {
      const status = l.whatsapp_number ? '✅' : '❌';
      console.log(`${status} @${l.username.padEnd(25)} → ${l.whatsapp_number || 'NULL'} (reverified: ${l.whatsapp_reverified_at})`);
    });
  } else {
    console.log('\n⚠️ Nenhum lead re-verificado ainda');
    console.log('   (O teste usou update_database: false, não persistiu)');
  }
}

check();
