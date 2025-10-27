import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function listNames() {
  const { data: leads } = await supabase
    .from('instagram_leads')
    .select('username, full_name')
    .order('username');

  console.log('📋 LISTA DE USERNAMES E FULL_NAMES EXTRAÍDOS:\n');
  console.log('Username → Full Name');
  console.log('─'.repeat(80));

  let withValidNames = 0;
  let sameAsUsername = 0;
  let nullNames = 0;

  leads!.forEach((lead) => {
    const name = lead.full_name || '(null)';
    let mark = '❌';

    if (lead.full_name && lead.full_name !== lead.username) {
      mark = '✅';
      withValidNames++;
    } else if (lead.full_name === lead.username) {
      mark = '⚠️ ';
      sameAsUsername++;
    } else {
      nullNames++;
    }

    console.log(`${mark} @${lead.username.padEnd(40)} → ${name}`);
  });

  console.log('\n' + '─'.repeat(80));
  console.log('📊 RESUMO:');
  console.log('   Total de leads:', leads!.length);
  console.log('   ✅ Nomes válidos (diferentes do username):', withValidNames);
  console.log('   ⚠️  Nomes iguais ao username:', sameAsUsername);
  console.log('   ❌ Nomes nulos:', nullNames);
  console.log('\n   Taxa de sucesso:', ((withValidNames / leads!.length) * 100).toFixed(1) + '%');
}

listNames();
